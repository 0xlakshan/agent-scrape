export default function jsonToXml(obj: unknown, root = "root"): string {
  const convert = (data: unknown, tag: string): string => {
    if (Array.isArray(data)) {
      return data.map((item) => convert(item, "item")).join("");
    }
    if (typeof data === "object" && data !== null) {
      const inner = Object.entries(data)
        .map(([k, v]) => convert(v, k))
        .join("");
      return `<${tag}>${inner}</${tag}>`;
    }
    return `<${tag}>${String(data)}</${tag}>`;
  };
  return `<?xml version="1.0"?>${convert(obj, root)}`;
}
