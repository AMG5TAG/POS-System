import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetServiceSettings, useUpdateServiceSettings, type ServiceCustomNote,
} from "@workspace/api-client-react";
import { Wrench, StickyNote, Loader2, Plus, Trash2, ArrowUp, ArrowDown, Pencil, Check, X } from "lucide-react";

const SERVICE_SETTINGS_QUERY_KEY = ["/api/service-settings"] as const;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default function ManagementServiceSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetServiceSettings();
  const updateMutation = useUpdateServiceSettings();
  const saving = updateMutation.isPending;

  const [draftTitle, setDraftTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");

  const notes = settings?.customNotes ?? [];

  function saveNotes(next: ServiceCustomNote[], done?: () => void) {
    updateMutation.mutate({ data: { customNotes: next } }, {
      onSuccess: (saved) => {
        queryClient.setQueryData(SERVICE_SETTINGS_QUERY_KEY, saved);
        queryClient.invalidateQueries({ queryKey: SERVICE_SETTINGS_QUERY_KEY });
        done?.();
      },
      onError: () => toast.error("Failed to save custom notes"),
    });
  }

  function addNote() {
    const title = draftTitle.trim();
    const text = draft.trim();
    if (!title || !text) return;
    saveNotes([...notes, { id: newId(), title, text }], () => {
      setDraftTitle(""); setDraft(""); toast.success("Note added");
    });
  }

  function saveEdit() {
    const title = editTitle.trim();
    const text = editText.trim();
    if (!editingId || !title || !text) return;
    saveNotes(notes.map((n) => (n.id === editingId ? { ...n, title, text } : n)), () => setEditingId(null));
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= notes.length) return;
    const next = [...notes];
    [next[index], next[to]] = [next[to], next[index]];
    saveNotes(next);
  }

  // Leaving edit mode if the note being edited disappears (deleted elsewhere).
  useEffect(() => {
    if (editingId && !notes.some((n) => n.id === editingId)) setEditingId(null);
  }, [notes, editingId]);

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" />
            Services
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Settings for service jobs. These apply across all staff and devices.
          </p>
        </div>

        {isLoading || !settings ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 items-start">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><StickyNote className="w-5 h-5 text-primary" /> Custom notes</CardTitle>
                <CardDescription>
                  Notes your team writes again and again. Each one appears as a button, labelled with its
                  title, in a service job's Notes section; pressing it puts the note in the note box, ready
                  to edit and append.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="custom-note-title">Title</Label>
                    <Input
                      id="custom-note-title"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="e.g. Waiting on parts"
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="custom-note-text">Note</Label>
                    <Textarea
                      id="custom-note-text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="e.g. Waiting on parts from supplier — ETA to be confirmed."
                      rows={5}
                      maxLength={2000}
                      className="resize-none w-full"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={addNote} disabled={!draftTitle.trim() || !draft.trim() || saving}>
                      <Plus className="w-4 h-4 mr-1" /> Add note
                    </Button>
                  </div>
                </div>

                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No custom notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {notes.map((note, i) => (
                      <li key={note.id} className="rounded-lg border bg-background p-3">
                        {editingId === note.id ? (
                          <div className="flex gap-2 items-start">
                            <div className="flex-1 space-y-2">
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Title"
                                maxLength={80}
                                autoFocus
                              />
                              <Textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={5}
                                maxLength={2000}
                                className="resize-none w-full"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit} disabled={!editTitle.trim() || !editText.trim() || saving} aria-label="Save note">
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-start">
                            <div className="flex-1 min-w-0 space-y-0.5">
                              {note.title ? (
                                <p className="text-sm font-semibold break-words">{note.title}</p>
                              ) : (
                                <p className="text-xs italic text-muted-foreground">No title — edit to add one</p>
                              )}
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">{note.text}</p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0 || saving} aria-label="Move up">
                                <ArrowUp className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === notes.length - 1 || saving} aria-label="Move down">
                                <ArrowDown className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(note.id); setEditTitle(note.title ?? ""); setEditText(note.text); }} disabled={saving} aria-label="Edit note">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => saveNotes(notes.filter((n) => n.id !== note.id))} disabled={saving} aria-label="Delete note">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
