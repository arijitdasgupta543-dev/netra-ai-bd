import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "eye-photos";

export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      if (!path) throw new Error('Photo path unavailable');
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ["signed-many", paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach((d) => d.path && d.signedUrl && (map[d.path] = d.signedUrl));
      return map;
    },
  });
}

/**
 * Uploads one photo. With a `name` (the eye/patient id) the path is deterministic, so a retry after a lost
 * response finds the object already there ("already exists") and reuses it instead of leaving an orphan copy.
 */
export async function uploadPhoto(folder: string, blob: Blob, name?: string): Promise<string> {
  const path = `${folder}/${name ?? crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) {
    const e = error as { message?: string; statusCode?: string | number };
    if (name && (String(e.statusCode) === "409" || /already exists|duplicate/i.test(e.message ?? ""))) return path;
    throw error;
  }
  return path;
}
