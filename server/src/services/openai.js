import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let client;

function getClient() {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

function parseJsonContent(content) {
  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function correctAndSuggestTopics(keyword) {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `당신은 한국어 YouTube Shorts 콘텐츠 기획자입니다.
사용자 키워드의 오타를 보정하고, Shorts에 적합한 관련 주제 5개를 제안하세요.
반드시 JSON으로만 응답하세요:
{
  "correctedKeyword": "보정된 키워드",
  "candidates": [
    { "title": "짧은 주제 제목", "description": "한 줄 설명" }
  ]
}
candidates는 정확히 5개여야 합니다.`,
      },
      {
        role: 'user',
        content: `키워드: ${keyword}`,
      },
    ],
  });

  const data = parseJsonContent(response.choices[0].message.content);
  if (!Array.isArray(data.candidates) || data.candidates.length < 5) {
    throw new Error('주제 후보 생성에 실패했습니다.');
  }
  return {
    correctedKeyword: data.correctedKeyword || keyword,
    candidates: data.candidates.slice(0, 5),
  };
}

export async function generateScript(topic) {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.8,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `당신은 YouTube Shorts용 한국어 나레이션 작가입니다.
TTS로 읽을 스크립트를 작성하세요. 목표 길이는 말하기 기준 약 45~60초입니다.
구조: 강한 후킹(1~2문장) → 본문 핵심 3~4포인트 → 짧은 CTA.
문장은 짧고 말하기 편하게. 이모지/해시태그/무대지시 금지.
JSON만 응답:
{ "script": "전체 스크립트 문자열", "estimatedSeconds": 55 }`,
      },
      {
        role: 'user',
        content: `주제 제목: ${topic.title}\n주제 설명: ${topic.description || ''}`,
      },
    ],
  });

  const data = parseJsonContent(response.choices[0].message.content);
  if (!data.script) throw new Error('스크립트 생성에 실패했습니다.');
  return {
    script: String(data.script).trim(),
    estimatedSeconds: Number(data.estimatedSeconds) || 55,
  };
}

export async function generateTts(scriptText, outputPath) {
  const openai = getClient();
  const speech = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    input: scriptText,
    response_format: 'mp3',
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/** Fallback if gpt-4o-mini-tts is unavailable */
export async function generateTtsFallback(scriptText, outputPath) {
  const openai = getClient();
  try {
    return await generateTts(scriptText, outputPath);
  } catch {
    const speech = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: scriptText,
      response_format: 'mp3',
    });
    const buffer = Buffer.from(await speech.arrayBuffer());
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }
}
