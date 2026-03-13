/// <reference types="vite/client" />

type NotepadNote = {
  id: string;
  title: string;
  preview: string;
  body: string;
  sectionId: string;
  createdAt: number;
  updatedAt: number;
};

type NotepadNoteApi = {
  list: () => Promise<NotepadNote[]>;
  create: (payload?: { sectionId?: string }) => Promise<NotepadNote>;
  update: (payload: { id: string; body?: string; title?: string; sectionId?: string }) => Promise<NotepadNote>;
  delete: (id: string) => Promise<void>;
  storagePath: () => Promise<string>;
};

declare global {
  interface Window {
    notepad?: {
      platform: string;
      notes: NotepadNoteApi;
      showNotification?: (opts: { title?: string; body?: string }) => void;
    };
  }
}

export {};
