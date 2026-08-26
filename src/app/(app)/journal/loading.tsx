export default function JournalLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-muted" />
        <div className="h-9 w-36 rounded bg-muted" />
      </div>
      <div className="h-12 rounded border bg-muted/50" />
      <div className="h-[400px] rounded border bg-muted/20" />
    </div>
  );
}
