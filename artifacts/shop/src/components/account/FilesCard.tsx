import { Download, ExternalLink, FileImage, FileText, File as FileIcon, FolderOpen, Loader2 } from "lucide-react";
import { useFiles, type SharedFile } from "@/lib/account";

const date = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function size(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Icon({ type }: { type: string }) {
  const cls = "w-5 h-5 text-brand shrink-0";
  if (type.startsWith("image/")) return <FileImage className={cls} />;
  if (type === "application/pdf" || type.startsWith("text/")) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

/* Your files: documents the shop has shared with this customer — receipts,
   reports, photos of a repair (POS › Customers › Files, "Customer can see").
   Files staff keep to themselves never reach this list. */
export function FilesCard() {
  const { data: files } = useFiles();
  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2"><FolderOpen className="w-5 h-5 text-brand" /> Your files</h2>
      {!files ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>
        : files.length === 0 ? <p className="text-sm text-stone-500 mt-3">No files from us yet. Documents we share with you — like reports and photos of your repairs — will appear here.</p>
        : <ul className="divide-y divide-stone-100 mt-2">{files.map((f) => <FileRow key={f.id} f={f} />)}</ul>}
    </section>
  );
}

function FileRow({ f }: { f: SharedFile }) {
  return (
    <li className="py-3 flex items-center gap-3">
      <Icon type={f.contentType} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{f.filename}</p>
        <p className="text-xs text-stone-500">{date(f.createdAt)} · {size(f.sizeBytes)}</p>
      </div>
      {f.canOpen && (
        <a href={f.url} target="_blank" rel="noreferrer" aria-label={`View ${f.filename}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-stone-300 text-sm hover:bg-stone-50">
          <ExternalLink className="w-4 h-4" /><span className="hidden sm:inline">View</span>
        </a>
      )}
      <a href={`${f.url}?download=1`} download={f.filename} aria-label={`Download ${f.filename}`}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand text-white text-sm hover:bg-brand-dark">
        <Download className="w-4 h-4" /><span className="hidden sm:inline">Download</span>
      </a>
    </li>
  );
}
