export default function ActivityLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-32 rounded bg-muted" />
      <div className="h-10 rounded border bg-muted/50" />
      <div className="h-[400px] rounded border bg-muted/20" />
    </div>
  );
}
