import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(Number(metadata.format.duration) || 0);
    });
  });
}

/**
 * Split Korean/English narration into subtitle chunks.
 * Prefer sentence breaks; otherwise split by character count (CJK-friendly).
 */
function splitScriptIntoChunks(script, maxLen = 20) {
  const sentences = script
    .split(/(?<=[.!?。！？…])\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
      continue;
    }
    let rest = sentence;
    while (rest.length > maxLen) {
      let cut = rest.lastIndexOf(' ', maxLen);
      // Korean often has no spaces — fall back to char boundary
      if (cut < Math.floor(maxLen * 0.4)) {
        cut = maxLen;
      }
      // Prefer breaking near middle punctuation if present in window
      const window = rest.slice(0, maxLen);
      const punct = Math.max(
        window.lastIndexOf(','),
        window.lastIndexOf('，'),
        window.lastIndexOf('、'),
        window.lastIndexOf(' '),
        window.lastIndexOf('요'),
        window.lastIndexOf('다')
      );
      if (punct >= Math.floor(maxLen * 0.4) && punct < maxLen) {
        cut = punct + 1;
      }
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks.length ? chunks : [script.slice(0, maxLen)];
}

/** Wrap a long single-line caption into two ASS lines with \N */
function formatAssText(text, lineLen = 18) {
  const safe = String(text).replace(/[{}]/g, '').replace(/\n/g, ' ');
  if (safe.length <= lineLen) return safe;
  let cut = Math.floor(safe.length / 2);
  const spaceNear = safe.lastIndexOf(' ', cut);
  if (spaceNear >= Math.floor(lineLen * 0.4)) cut = spaceNear;
  return `${safe.slice(0, cut).trim()}\\N${safe.slice(cut).trim()}`;
}

function writeAssSubtitles(chunks, duration, assPath) {
  const per = duration / Math.max(chunks.length, 1);
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Slightly smaller font + wider margins so Korean lines are less likely to clip
    'Style: Default,Noto Sans CJK KR,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,80,80,240,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const toTs = (sec) => {
    const clamped = Math.max(0, sec);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = Math.floor(clamped % 60);
    const cs = Math.floor((clamped % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  chunks.forEach((text, i) => {
    const start = i * per;
    const end = Math.min(duration, (i + 1) * per);
    lines.push(
      `Dialogue: 0,${toTs(start)},${toTs(end)},Default,,0,0,0,,${formatAssText(text)}`
    );
  });

  fs.writeFileSync(assPath, lines.join('\n'), 'utf8');
  return assPath;
}

function runFfmpeg(buildFn) {
  return new Promise((resolve, reject) => {
    const cmd = buildFn(ffmpeg());
    cmd.on('end', resolve).on('error', reject).run();
  });
}

/**
 * Ensure slideshow video is at least `targetDuration` seconds (pad by cloning last frame).
 */
async function ensureVideoDuration(inputPath, outputPath, targetDuration) {
  const current = await getMediaDuration(inputPath);
  if (current >= targetDuration - 0.05) {
    if (inputPath !== outputPath) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return outputPath;
  }
  const pad = Math.max(0.1, targetDuration - current + 0.05);
  await runFfmpeg((cmd) =>
    cmd
      .input(inputPath)
      .outputOptions([
        '-vf',
        `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}`,
        '-t',
        String(targetDuration),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-an',
      ])
      .output(outputPath)
  );
  return outputPath;
}

/**
 * Compose vertical Shorts video: slideshow of images + TTS + subtitles.
 * Audio (TTS) duration is the master clock — video is padded to match; no -shortest cutoff.
 */
export async function composeShortsVideo({
  imagePaths,
  audioPath,
  script,
  outputPath,
  workDir,
}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const audioDuration = await getMediaDuration(audioPath);
  if (!audioDuration || audioDuration < 1) {
    throw new Error('TTS 오디오 길이를 확인할 수 없습니다.');
  }

  // Shorts soft-cap at 60s; do not artificially pad short TTS up to 5s anymore
  const targetDuration = Math.min(audioDuration, 60);
  if (audioDuration > 60) {
    console.warn(
      `[ffmpeg] TTS ${audioDuration.toFixed(1)}s > 60s; output capped at 60s for Shorts`
    );
  }

  const images = imagePaths.length ? imagePaths : [];
  if (!images.length) throw new Error('배경 이미지가 없습니다.');

  const perImage = targetDuration / images.length;
  const listPath = path.join(workDir, 'images.txt');
  const escapeConcatPath = (p) => p.replace(/'/g, "'\\''");
  const listContent = images
    .map((img) => `file '${escapeConcatPath(img)}'\nduration ${perImage.toFixed(3)}`)
    .join('\n');
  // concat demuxer requires the last file repeated without duration
  fs.writeFileSync(
    listPath,
    `${listContent}\nfile '${escapeConcatPath(images[images.length - 1])}'\n`,
    'utf8'
  );

  const chunks = splitScriptIntoChunks(script, 20);
  const assPath = path.join(workDir, 'subs.ass');
  writeAssSubtitles(chunks, targetDuration, assPath);

  const slideshowRawPath = path.join(workDir, 'slideshow_raw.mp4');
  const slideshowPath = path.join(workDir, 'slideshow.mp4');

  await runFfmpeg((cmd) =>
    cmd
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30',
        '-t',
        String(targetDuration),
        '-vsync',
        'cfr',
        '-pix_fmt',
        'yuv420p',
        '-an',
      ])
      .output(slideshowRawPath)
  );

  await ensureVideoDuration(slideshowRawPath, slideshowPath, targetDuration);

  const fontsDir = '/usr/share/fonts/opentype/noto';
  const assEscaped = assPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
  const fontsEscaped = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
  const vf = fs.existsSync(fontsDir)
    ? `ass='${assEscaped}':fontsdir='${fontsEscaped}'`
    : `ass='${assEscaped}'`;

  // Master clock = audio. Do NOT use -shortest (that was cutting narration short).
  await runFfmpeg((cmd) =>
    cmd
      .input(slideshowPath)
      .input(audioPath)
      .outputOptions([
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-t',
        String(targetDuration),
        '-movflags',
        '+faststart',
        '-pix_fmt',
        'yuv420p',
      ])
      .output(outputPath)
  );

  const finalDuration = await getMediaDuration(outputPath);
  return {
    outputPath,
    duration: finalDuration || targetDuration,
    audioDuration,
  };
}

export async function ensureFfmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    throw new Error('시스템에 ffmpeg가 설치되어 있지 않습니다.');
  }
}
