import { supabase } from "./supabase.js";

// Supabase 一次最多回 1000 筆，題目多了要分頁抓
const PAGE_SIZE = 1000;

async function fetchAllQuestions() {
  const all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, unit_id, qtype, stem, options, answers, explanation")
      .order("unit_id")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE_SIZE) return all;
  }
}

// 個人練習題：practice/practice.json 只在本機存在（已加入 .gitignore），
// 不會寫進 Supabase，也不會跟著部署出去。檔案不存在就當作沒有。
const PRACTICE_FILES = [
  { url: "practice/practice.json", unitId: 9001 },
  { url: "practice/practice2.json", unitId: 9002 },
];

async function loadPractice({ url, unitId }) {
  const idBase = unitId * 1000;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const { title, questions } = await res.json();
    if (!Array.isArray(questions)) throw new Error("questions 不是陣列");
    const valid = questions.filter((q) =>
      typeof q.stem === "string" && Array.isArray(q.options) && Array.isArray(q.answers)
      && q.answers.length > 0 && q.answers.every((a) => q.options.includes(a)));
    if (valid.length !== questions.length) {
      console.warn(`練習題有 ${questions.length - valid.length} 題格式不對，已略過`);
    }
    return {
      unit: { id: unitId, title: title || `練習 ${unitId}` },
      questions: valid.map((q, i) => ({
        id: idBase + i + 1,
        unit_id: unitId,
        qtype: q.qtype ?? "single",
        stem: q.chapter ? `【${q.chapter}】${q.stem}` : q.stem,
        options: q.options,
        answers: q.answers,
        explanation: q.explanation ?? null,
      })),
    };
  } catch (err) {
    console.warn(`練習題 ${url} 讀取失敗：${err.message}`);
    return null;
  }
}

export async function loadAll() {
  const { data: dbUnits, error } = await supabase.from("units").select("id, title").order("id");
  if (error) throw error;
  const [dbQuestions, ...practiceSets] = await Promise.all([
    fetchAllQuestions(),
    ...PRACTICE_FILES.map(loadPractice),
  ]);
  const practice = practiceSets.filter(Boolean);
  const units = [...dbUnits, ...practice.map((p) => p.unit)];
  const questions = [...dbQuestions, ...practice.flatMap((p) => p.questions)];
  const unitTitle = new Map(units.map((u) => [u.id, u.title]));
  for (const u of units) u.count = questions.filter((q) => q.unit_id === u.id).length;
  return { units, questions, unitTitle };
}
