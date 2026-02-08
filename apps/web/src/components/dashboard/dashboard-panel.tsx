import * as React from 'react';
import { Card, CardContent } from '~/components/ui/card';
import { cn } from '~/lib/utils';

type PanelProps = React.ComponentProps<'div'>;

export function DashboardPanel({ className, ...props }: PanelProps) {
  return (
    <Card
      className={cn('border-border/60 shadow-none gap-0 py-0', className)}
      {...props}
    />
  );
}

export function DashboardPanelContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <CardContent className={cn('px-5 py-5', className)} {...props} />;
}
