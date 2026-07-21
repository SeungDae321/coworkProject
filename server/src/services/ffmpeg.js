import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(Number(metadata.format.duration) || 55);
    });
  });
}

function splitScriptIntoChunks(script, maxLen = 28) {
  const sentences = script
    .split(/(?<=[.!?。！？…])\s+|\n+/)
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
      if (cut < 8) cut = maxLen;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
  }
  return chunks.length ? chunks : [script.slice(0, maxLen)];
}

function writeAssSubtitles(chunks, duration, assPath) {
  const per = duration / chunks.length;
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Noto Sans CJK KR,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,2,60,60,220,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const toTs = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  chunks.forEach((text, i) => {
    const start = i * per;
    const end = Math.min(duration, (i + 1) * per);
    const safe = text.replace(/[{}]/g, '');
    lines.push(`Dialogue: 0,${toTs(start)},${toTs(end)},Default,,0,0,0,,${safe}`);
  });

  fs.writeFileSync(assPath, lines.join('\n'), 'utf8');
  return assPath;
}

/**
 * Compose vertical Shorts video: slideshow of images + TTS + subtitles.
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

  const duration = await getAudioDuration(audioPath);
  const targetDuration = Math.min(Math.max(duration, 5), 60);
  const images = imagePaths.length ? imagePaths : [];
  if (!images.length) throw new Error('배경 이미지가 없습니다.');

  const perImage = targetDuration / images.length;
  const listPath = path.join(workDir, 'images.txt');
  const listContent = images
    .map((img) => `file '${img.replace(/'/g, "'\\''")}'\nduration ${perImage.toFixed(3)}`)
    .join('\n');
  fs.writeFileSync(
    listPath,
    `${listContent}\nfile '${images[images.length - 1].replace(/'/g, "'\\''")}'\n`,
    'utf8'
  );

  const chunks = splitScriptIntoChunks(script);
  const assPath = path.join(workDir, 'subs.ass');
  writeAssSubtitles(chunks, targetDuration, assPath);

  const slideshowPath = path.join(workDir, 'slideshow.mp4');

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30',
        '-t',
        String(targetDuration),
        '-pix_fmt',
        'yuv420p',
        '-an',
      ])
      .output(slideshowPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  const fontsDir = '/usr/share/fonts/opentype/noto';
  const assEscaped = assPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
  const fontsEscaped = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
  const vf = fs.existsSync(fontsDir)
    ? `ass='${assEscaped}':fontsdir='${fontsEscaped}'`
    : `ass='${assEscaped}'`;

  await new Promise((resolve, reject) => {
    ffmpeg()
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
        '-shortest',
        '-movflags',
        '+faststart',
        '-pix_fmt',
        'yuv420p',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });

  return { outputPath, duration: targetDuration };
}

export async function ensureFfmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    throw new Error('시스템에 ffmpeg가 설치되어 있지 않습니다.');
  }
}
