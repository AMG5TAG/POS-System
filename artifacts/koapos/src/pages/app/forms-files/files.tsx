/**
 * Forms & Files › Files — business documents the merchant keeps against their
 * records: contracts, insurance, menus, branding.
 */
import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileText, File, Image, FileSpreadsheet, Folder, X } from "lucide-react";

export default function FilesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string; uploadedAt: Date }[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    setUploadedFiles(prev => [
      ...prev,
      ...arr.map(f => ({ name: f.name, size: f.size, type: f.type, uploadedAt: new Date() })),
    ]);
    toast.success(`${arr.length} file${arr.length !== 1 ? "s" : ""} uploaded`);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx));

  const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  const getFileIcon = (mime: string) => {
    if (mime.startsWith("image/")) return Image;
    if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
    if (mime === "application/pdf") return FileText;
    if (mime.startsWith("text/")) return FileText;
    return File;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Files</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Store business documents and link them to customers, services and appointments.
            </p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload File
          </Button>
        </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
                onDragLeave={() => setDraggingOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  draggingOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Drop files here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDFs, images, spreadsheets, and documents</p>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: Folder,          label: "Organised Folders",   desc: "Group files by type — contracts, insurance, menus, branding" },
                  { icon: FileText,        label: "Attach to Records",   desc: "Link files to customers, services, or appointments" },
                  { icon: FileSpreadsheet, label: "Any File Type",       desc: "PDFs, images, Word docs, spreadsheets, and more" },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 rounded-xl border p-3 bg-card">
                    <item.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* File list */}
              {uploadedFiles.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Uploaded Files</CardTitle>
                    <CardDescription>{uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} in this session</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {uploadedFiles.map((f, idx) => {
                        const Icon = getFileIcon(f.type);
                        return (
                          <div key={idx} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{f.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatBytes(f.size)} · {f.uploadedAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                            <button
                              onClick={() => removeFile(idx)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Folder className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No files uploaded yet</p>
                  <p className="text-xs mt-1">Upload files above to store them here</p>
                </div>
              )}
      </div>
    </AppLayout>
  );
}
