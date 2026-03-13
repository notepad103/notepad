/// <reference types="vite/client" />

type NotepadNote = {
  id: string;
  title: string;
  preview: string;
  body: string;
  sectionId: string;
  isImportant: boolean;
  createdAt: number;
  updatedAt: number;
};

type NotepadNoteApi = {
  list: () => Promise<NotepadNote[]>;
  create: (payload?: { sectionId?: string }) => Promise<NotepadNote>;
  update: (payload: { id: string; body?: string; title?: string; sectionId?: string; isImportant?: boolean }) => Promise<NotepadNote>;
  delete: (id: string) => Promise<void>;
  storagePath: () => Promise<string>;
};

type NotepadCustomSection = {
  id: string;
  label: string;
  sortOrder: number;
  createdAt: number;
};

type NotepadSectionApi = {
  list: () => Promise<NotepadCustomSection[]>;
  create: (payload: { label: string }) => Promise<NotepadCustomSection>;
  update: (payload: { id: string; label?: string; sortOrder?: number }) => Promise<NotepadCustomSection>;
  delete: (id: string) => Promise<void>;
};

declare global {
  interface Window {
    notepad?: {
      platform: string;
      notes: NotepadNoteApi;
      sections: NotepadSectionApi;
      showNotification?: (opts: { title?: string; body?: string }) => void;
    };
  }
}

export {};
