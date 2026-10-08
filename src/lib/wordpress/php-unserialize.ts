/**
 * Minimal PHP unserialize() for WXR postmeta values (ACF galleries,
 * relationship fields, checkbox arrays). Returns the input string unchanged
 * when it is not a serialized value or cannot be parsed.
 */
export function maybeUnserialize(value: string): unknown {
  if (typeof value !== "string" || !/^(a|s|i|d|b|N|O):/.test(value.trim())) return value;
  try {
    const buf = Buffer.from(value.trim(), "utf8");
    let pos = 0;
    const readUntil = (ch: string) => {
      const end = buf.indexOf(ch, pos);
      if (end < 0) throw new Error("bad");
      const s = buf.subarray(pos, end).toString("utf8");
      pos = end + 1;
      return s;
    };
    const parse = (): unknown => {
      const type = String.fromCharCode(buf[pos]);
      pos += 2; // type + ':' (or ';' for N)
      switch (type) {
        case "N": return null;
        case "b": return readUntil(";") === "1";
        case "i": return parseInt(readUntil(";"), 10);
        case "d": return parseFloat(readUntil(";"));
        case "s": {
          const len = parseInt(readUntil(":"), 10);
          pos += 1; // opening quote
          const s = buf.subarray(pos, pos + len).toString("utf8");
          pos += len + 2; // closing quote + ;
          return s;
        }
        case "a": {
          const n = parseInt(readUntil(":"), 10);
          pos += 1; // {
          const entries: [string | number, unknown][] = [];
          for (let i = 0; i < n; i++) {
            const k = parse() as string | number;
            entries.push([k, parse()]);
          }
          pos += 1; // }
          const isList = entries.every(([k], i) => k === i);
          return isList ? entries.map(([, v]) => v) : Object.fromEntries(entries);
        }
        case "O": {
          readUntil(":"); // class name length
          readUntil(":"); // class name
          const n = parseInt(readUntil(":"), 10);
          pos += 1;
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < n; i++) {
            const k = String(parse()).replace(/^\0[^\0]*\0/, "");
            obj[k] = parse();
          }
          pos += 1;
          return obj;
        }
        default: throw new Error("unsupported");
      }
    };
    const out = parse();
    return out;
  } catch {
    return value;
  }
}
