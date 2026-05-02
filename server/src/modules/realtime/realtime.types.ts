export type TaskModuleKey = 'draw' | 'video' | 'music' | 'model3d';
export type TaskEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'task.failed';

export type TaskEventPayload = {
  module: TaskModuleKey;
  type: TaskEventType;
  taskId: string;
  status: string;
  progress?: number;
  errorMessage?: string | null;
  updatedAt?: string;

  // Common context fields (optional, for UI list refresh)
  provider?: string | null;
  taskType?: string | null;

  // Result URLs (module-specific, optional)
  imageUrl?: string | null; // draw
  videoUrl?: string | null; // video
  audioUrl?: string | null; // music
  coverUrl?: string | null; // music
  resultModelUrl?: string | null; // model3d
  resultPreviewUrl?: string | null; // model3d
};

export function userRoom(userId: string) {
  return `user:${userId}`;
}
