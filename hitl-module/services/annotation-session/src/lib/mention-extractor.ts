/** Extracts @mention usernames from a comment body. */
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  const regex = /@(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}
