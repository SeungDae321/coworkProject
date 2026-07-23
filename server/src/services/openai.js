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

  async function requestOnce(extraInstruction = '') {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `당신은 YouTube Shorts용 한국어 나레이션 작가입니다.
TTS로 읽을 스크립트를 작성하세요.
목표 길이: 말하기 기준 약 45~60초.
분량: 공백 제외 한국어 글자 수 약 450~650자 (최소 400자 이상).
구조: 강한 후킹(1~2문장) → 본문 핵심 3~4포인트 → 짧은 CTA.
문장은 짧고 말하기 편하게. 이모지/해시태그/무대 지시 금지.
JSON만 응답:
{ "script": "전체 스크립트 문자열", "estimatedSeconds": 55 }`,
        },
        {
          role: 'user',
          content: `주제 제목: ${topic.title}\n주제 설명: ${topic.description || ''}${
            extraInstruction ? `\n\n추가 요청: ${extraInstruction}` : ''
          }`,
        },
      ],
    });

    const data = parseJsonContent(response.choices[0].message.content);
    if (!data.script) throw new Error('스크립트 생성에 실패했습니다.');
    const script = String(data.script).trim();
    const charCount = script.replace(/\s/g, '').length;
    return {
      script,
      estimatedSeconds: Number(data.estimatedSeconds) || 55,
      charCount,
    };
  }

  let result = await requestOnce();
  // Too short for a ~45s Short — regenerate once
  if (result.charCount < 250) {
    result = await requestOnce(
      '이전 결과가 너무 짧았습니다. 공백 제외 450자 이상으로 더 길고 구체적인 나레이션을 작성하세요.'
    );
  }

  return {
    script: result.script,
    estimatedSeconds: result.estimatedSeconds,
  };
}

/**
 * Split an approved Shorts script into 4–6 visual scene search queries for Pexels.
 */
export async function extractSceneSearchQueries(script, topicTitle = '') {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `당신은 스톡 이미지 검색 전문가입니다.
한국어 YouTube Shorts 나레이션 스크립트를 읽고, Pexels에서 찾을 수 있는
구체적인 시각 장면으로 나눕니다.

규칙:
- 장면 수는 4개 이상 6개 이하
- query는 영어 스톡포토 검색어 (2~6단어, 구체적 시각 묘사)
- 추상적 단어(success, happiness) 대신 눈에 보이는 것
  (예: morning coffee kitchen sunlight, person jogging park sunrise)
- caption은 해당 장면을 한 줄로 요약한 한국어
- 스크립트 흐름 순서 유지

JSON만 응답:
{
  "scenes": [
    { "query": "english stock keywords", "caption": "한국어 요약" }
  ]
}`,
      },
      {
        role: 'user',
        content: `주제: ${topicTitle || '(없음)'}\n\n스크립트:\n${script}`,
      },
    ],
  });

  const data = parseJsonContent(response.choices[0].message.content);
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const normalized = scenes
    .map((s) => ({
      query: String(s?.query || '').trim(),
      caption: String(s?.caption || '').trim(),
    }))
    .filter((s) => s.query);

  if (normalized.length < 4) {
    throw new Error('장면 키워드 추출에 실패했습니다. (4개 미만)');
  }

  return normalized.slice(0, 6);
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
