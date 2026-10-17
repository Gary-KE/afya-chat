/**
 * OpenAI-compatible APIs stream answers as Server-Sent Events:
 *   data: {"choices":[{"delta":{"content":"Hel"}}]}
 *   data: [DONE]
 * This turns that byte stream into a stream of plain text pieces.
 */
export function sseToText(body: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  return body.pipeThrough(new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) emit(line, controller);
    },
    flush(controller) { if (buffer) emit(buffer, controller); }
  }));
}

function emit(line: string, controller: TransformStreamDefaultController<string>) {
  const l = line.trim();
  if (!l.startsWith("data:")) return;
  const data = l.slice(5).trim();
  if (!data || data === "[DONE]") return;
  try {
    const piece = JSON.parse(data)?.choices?.[0]?.delta?.content;
    if (typeof piece === "string" && piece) controller.enqueue(piece);
  } catch { /* ignore keep-alive or partial lines */ }
}
