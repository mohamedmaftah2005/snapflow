import type { ObjectStorage } from "@/lib/storage/types";

/** Shared in-memory storage fake for worker tests. */
export function fakeStorage(): ObjectStorage & { uploaded: string[]; removed: string[] } {
  const uploaded: string[] = [];
  const removed: string[] = [];
  return {
    kind: "fake",
    uploaded,
    removed,
    async upload(input) {
      uploaded.push(input.key);
    },
    async getSignedUrl(key) {
      return `https://storage.example/${key}?sig=short-lived`;
    },
    async remove(key) {
      removed.push(key);
    },
    async downloadToFile() {
      throw new Error("fake has no objects");
    },
  };
}
