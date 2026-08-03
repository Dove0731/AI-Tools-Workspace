function normalize(text) {
  return text.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function tokenize(text) {
  const normalized = normalize(text);
  const tokens = [];
  for (const word of normalized.match(/[a-z0-9][a-z0-9._%+-]*/g) || []) tokens.push(word);
  const chineseRuns = normalized.match(/[\p{Script=Han}]+/gu) || [];
  for (const run of chineseRuns) {
    if (run.length === 1) tokens.push(run);
    for (let index = 0; index < run.length - 1; index += 1) tokens.push(run.slice(index, index + 2));
  }
  return tokens;
}

function frequencies(tokens) {
  const map = new Map();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}

export function searchIndex(index, question, options = {}) {
  const topK = options.topK || 5;
  const minimumScore = options.minimumScore ?? 0.35;
  const queryTokens = [...new Set(tokenize(question))];
  if (!queryTokens.length) return [];
  const documentFrequency = new Map();
  const prepared = index.chunks.map((chunk) => {
    const tokens = tokenize(`${chunk.sourceTitle} ${chunk.heading} ${chunk.text}`);
    const frequency = frequencies(tokens);
    for (const token of queryTokens) {
      if (frequency.has(token)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
    return { chunk, tokens, frequency };
  });
  const total = Math.max(prepared.length, 1);
  const normalizedQuestion = normalize(question);
  const coreQuestion = normalizedQuestion
    .replace(/请问|如何|怎么|怎样|有哪些|是什么|哪些|一下|是否|可以|吗|呢|[？?]/gu, "")
    .replace(/\s+/g, "")
    .trim();
  const ranked = prepared
    .map(({ chunk, tokens, frequency }) => {
      let score = 0;
      for (const token of queryTokens) {
        const tf = frequency.get(token) || 0;
        if (!tf) continue;
        const idf = Math.log(1 + (total + 1) / ((documentFrequency.get(token) || 0) + 1));
        score += idf * (tf / (1 + 0.25 * tf));
      }
      score /= Math.sqrt(Math.max(tokens.length, 1) / 40);
      const heading = normalize(`${chunk.sourceTitle} ${chunk.heading}`);
      if (queryTokens.some((token) => heading.includes(token))) score += 0.8;
      if (coreQuestion.length >= 3 && heading.replace(/\s+/g, "").includes(coreQuestion)) score += 3;
      if (normalizedQuestion.length >= 4 && normalize(chunk.text).includes(normalizedQuestion)) score += 3;
      return { ...chunk, score: Number(score.toFixed(4)) };
    })
    .filter((result) => result.score >= minimumScore)
    .sort((left, right) => right.score - left.score);

  const stageIntent = /(阶段|流程|步骤|环节)/u.test(question);
  if (stageIntent && ranked.length) {
    const candidateSources = [...new Set(ranked.slice(0, 12).map((item) => item.sourceId))];
    const outlines = candidateSources
      .map((sourceId) => {
        const siblings = index.chunks
          .filter((chunk) => chunk.sourceId === sourceId && /^(G\d+|M\d+)\s+/iu.test(chunk.heading))
          .sort((left, right) => {
            const leftNumber = Number(left.heading.match(/\d+/u)?.[0] || 0);
            const rightNumber = Number(right.heading.match(/\d+/u)?.[0] || 0);
            return leftNumber - rightNumber;
          });
        return { sourceId, siblings };
      })
      .filter((item) => item.siblings.length >= 3)
      .sort((left, right) => right.siblings.length - left.siblings.length);
    if (outlines.length) {
      const siblings = outlines[0].siblings;
      const first = siblings[0];
      ranked.unshift({
        ...first,
        id: `outline:${first.sourceId}`,
        heading: "阶段目录",
        text: siblings.map((item) => item.heading).join("\n"),
        outlineItems: siblings.map((item) => item.heading),
        score: Number((ranked[0].score + 5).toFixed(4))
      });
    }
  }
  const seenIds = new Set();
  return ranked.filter((item) => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  }).slice(0, topK);
}

export function sourceLabel(result) {
  const location = result.sourceType === "obsidian"
    ? result.relativePath
    : result.sourceType === "learned-scenario"
      ? "本人已确认场景库"
      : result.sourceUrl || result.sourceId;
  return `${result.sourceTitle} > ${result.heading}（${location}）`;
}
