/**
 * Drag-and-drop / click-to-browse file upload zone.
 * Props: label, file, onFileChange, accept, disabled
 */
import { useRef, useState } from "react";
import { CloudArrowUpIcon, XCircleIcon, DocumentIcon } from "@heroicons/react/24/outline";

export default function FileDropZone({ label, file, onFileChange, accept = ".xlsx,.xls", disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFileChange(dropped);
  }

  function handleDragOver(e) {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleClick() {
    if (!disabled) inputRef.current?.click();
  }

  function handleInput(e) {
    const f = e.target.files[0];
    if (f) onFileChange(f);
    e.target.value = "";
  }

  function handleRemove(e) {
    e.stopPropagation();
    onFileChange(null);
  }

  const hasFile = !!file;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-gray-700">{label}</label>

      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        aria-label={`Upload ${label}`}
        className={[
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-all cursor-pointer select-none",
          dragging
            ? "border-blue-500 bg-blue-50 scale-[1.01]"
            : hasFile
            ? "border-green-400 bg-green-50"
            : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50",
          disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInput}
          disabled={disabled}
          aria-hidden="true"
        />

        {hasFile ? (
          <>
            <DocumentIcon className="h-8 w-8 text-green-500" aria-hidden="true" />
            <p className="text-sm font-medium text-green-700 text-center break-all max-w-xs">
              {file.name}
            </p>
            <p className="text-xs text-gray-400">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 text-gray-400 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 rounded-full"
              aria-label="Hapus file"
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <CloudArrowUpIcon className="h-10 w-10 text-gray-400" aria-hidden="true" />
            <p className="text-sm text-gray-600 font-medium">
              Drag &amp; drop atau{" "}
              <span className="text-blue-600 underline">klik untuk pilih file</span>
            </p>
            <p className="text-xs text-gray-400">Format: .xlsx, .xls — maks. 50 MB</p>
          </>
        )}
      </div>
    </div>
  );
}
