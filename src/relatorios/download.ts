export function downloadReport(
  bytes: Uint8Array,
  filename: string,
  mime: string,
) {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes).buffer], { type: mime }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
