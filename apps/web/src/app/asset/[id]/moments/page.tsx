'use client';

import { MomentsTab } from '~/components/moments/moments-tab';

export default function MomentsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40">
      <MomentsTab />
    </div>
  );
}
