// ============================================================
// QUIZ MATH - numeric questions with variables
// ============================================================
// A numeric question is a template:
//   prompt   "A {m} kg cart accelerates at {a} m/s². What net force acts on it?"
//   variables m: 2–20 step 0.5 · a: 0.5–5 decimals 1   (or a list of values,
//            or a formula from earlier variables, e.g. v = a*t)
//   formula  m*a
// Every time it comes up, new numbers are picked, {m} and {a} are filled
// in, the answer is worked out from the formula, and what you type is
// checked within a tolerance (default 1 %). You can type a number,
// 3/4, 2.5e3, sqrt(2)… — anything the formula language understands.
//
// Formula language (no eval — a small parser):
//   + - * / ^ ( )   numbers like 2, 0.5, 6.02e23
//   pi, e
//   sqrt cbrt abs exp ln log (base 10) log2 sin cos tan asin acos atan
//   sinh cosh tanh floor ceil round min max pow rad (deg→rad) deg (rad→deg)
//   Trig works in radians: write sin(rad(30)) for degrees.
// ============================================================

export interface QuizVariable {
  name: string;
  min?: number;
  max?: number;
  step?: number;        // pick multiples of this (e.g. 0.5)
  decimals?: number;    // or round to this many decimals
  values?: number[];    // or pick one of these
  expr?: string;        // or work it out from earlier variables
  unit?: string;
}

export interface NumericSpec {
  variables: QuizVariable[];
  formula: string;
  tolerancePct?: number;   // default 1
  unit?: string;
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, pow: Math.pow,
  rad: (d: number) => (d * Math.PI) / 180, deg: (r: number) => (r * 180) / Math.PI,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new Error(`Bad number near "${s.slice(i, i + 8)}"`);
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))!;
      out.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
    }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

// expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ;
// unary := ('-'|'+') unary | power ; power := primary ('^' unary)? (right-assoc)
export function evaluate(src: string, vars: Record<string, number> = {}): number {
  const toks = tokenize(String(src || ''));
  if (!toks.length) throw new Error('Empty formula');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return !!t && t.t === 'op' && t.v === v; };
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`Expected "${v}"`); p++; };

  const expr = (): number => {
    let v = term();
    while (isOp('+') || isOp('-')) { const op = (toks[p++] as any).v; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (isOp('*') || isOp('/')) { const op = (toks[p++] as any).v; const r = unary(); v = op === '*' ? v * r : v / r; }
    return v;
  };
  const unary = (): number => {
    if (isOp('-')) { p++; return -unary(); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (isOp('^')) { p++; return Math.pow(base, unary()); }
    return base;
  };
  const primary = (): number => {
    const t = peek();
    if (!t) throw new Error('Formula ends too early');
    if (t.t === 'num') { p++; return t.v; }
    if (t.t === 'op' && t.v === '(') { p++; const v = expr(); eat(')'); return v; }
    if (t.t === 'id') {
      p++;
      if (isOp('(')) {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function "${t.v}"`);
        p++;
        const args: number[] = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
        eat(')');
        return fn(...args);
      }
      if (t.v in vars) return vars[t.v];
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error(`Unknown name "${t.v}"`);
    }
    throw new Error(`Unexpected "${(t as any).v}"`);
  };

  const v = expr();
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as any).v}"`);
  return v;
}

const roundTo = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

// New numbers for one showing of the question
export function makeInstance(spec: NumericSpec, rand: () => number = Math.random) {
  const vars: Record<string, number> = {};
  for (const v of spec.variables || []) {
    if (!v.name) continue;
    let x: number;
    if (v.expr && v.expr.trim()) x = evaluate(v.expr, vars);
    else if (v.values && v.values.length) x = v.values[Math.floor(rand() * v.values.length)];
    else {
      const lo = Number(v.min ?? 0), hi = Number(v.max ?? lo);
      if (v.step && v.step > 0) {
        const n = Math.floor((hi - lo) / v.step + 1e-9);
        x = lo + Math.floor(rand() * (n + 1)) * v.step;
        const stepDecimals = (String(v.step).split('.')[1] || '').length;
        x = roundTo(x, stepDecimals);
      } else {
        x = lo + rand() * (hi - lo);
        x = roundTo(x, v.decimals ?? 2);
      }
    }
    if (v.decimals != null && !(v.expr && v.expr.trim())) x = roundTo(x, v.decimals);
    vars[v.name] = x;
  }
  const answer = evaluate(spec.formula, vars);
  return { vars, answer };
}

// Readable number: up to 4 significant figures, no trailing zeros; scientific when huge/tiny
export function formatNumber(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-4) return x.toExponential(sig - 1).replace(/\.?0+e/, 'e');
  return String(Number(x.toPrecision(sig)));
}

// "{m} kg" → "12.5 kg"; also {answer}
export function fillTemplate(text: string, vars: Record<string, number>, answer?: number) {
  return String(text || '').replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (all, name) => {
    if (name === 'answer' && answer !== undefined) return formatNumber(answer);
    return name in vars ? formatNumber(vars[name], 6) : all;
  });
}

// Is what you typed close enough?
export function checkAnswer(typed: string, expected: number, tolerancePct = 1) {
  let given: number;
  try { given = evaluate(String(typed).replace(/,(?=\d{3}\b)/g, '').trim()); }
  catch { return { ok: false, given: NaN, error: 'Type a number (e.g. 12.5, 3/4, 2.5e3)' }; }
  if (!Number.isFinite(given)) return { ok: false, given, error: 'Type a number' };
  const tol = Math.abs(expected) * (tolerancePct / 100);
  const ok = expected === 0 ? Math.abs(given) < 1e-9 : Math.abs(given - expected) <= tol + 1e-12;
  return { ok, given, error: null as string | null };
}