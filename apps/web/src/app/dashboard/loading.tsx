import { Spinner } from '~/components/ui/spinner';

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}
