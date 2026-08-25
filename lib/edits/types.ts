export type EditsProject = {
  id: string;
  user_id: string;
  name: string;
  audio_path: string | null;
  audio_filename: string | null;
  countdown_seconds: number;
  countdown_enabled: boolean;
  countdown_in_edit_preview: boolean;
  lyrics_raw: string | null;
  created_at: string;
  updated_at: string;
};

export type EditsProjectSummary = Pick<
  EditsProject,
  "id" | "name" | "audio_filename" | "updated_at"
> & { cut_count: number };

export type EditsCut = {
  id: string;
  project_id: string;
  start_time: number;
  end_time: number;
  label: string;
  note: string;
  color: string;
  shot: boolean;
  sort_order: number;
};

export type EditsLyricLine = {
  id: string;
  project_id: string;
  text: string;
  time: number | null;
  sort_order: number;
};
