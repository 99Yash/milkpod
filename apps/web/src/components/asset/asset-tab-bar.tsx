'use client';

import {
  NavTabs,
  NavTabIndicator,
  navTabVariants,
} from '~/components/ui/tabs';
import { useAssetTabContext, type AssetTab } from './asset-tab-context';

const tabs: { id: AssetTab; label: string }[] = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'chat', label: 'Ask AI' },
  { id: 'moments', label: 'Moments' },
  { id: 'comments', label: 'Comments' },
];

export function AssetTabBar() {
  const { activeTab, setActiveTab } = useAssetTabContext();

  return (
    <NavTabs>
      {tabs.map(({ id, label }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={navTabVariants({ active: isActive })}
          >
            {label}
            {isActive && <NavTabIndicator />}
          </button>
        );
      })}
    </NavTabs>
  );
}
