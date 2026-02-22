import { cn } from '~/lib/utils';
import type { Chapter } from './types';
import { formatTime } from './types';

const MIN_SEGMENT_WIDTH_PCT = 2;

interface ChapterProgressBarProps {
  chapters: Chapter[];
  activeChapterId?: string;
  onChapterClick: (chapterId: string) => void;
}

export function ChapterProgressBar({
  chapters,
  activeChapterId,
  onChapterClick,
}: ChapterProgressBarProps) {
  if (chapters.length === 0) return null;

  const totalDuration =
    chapters[chapters.length - 1].endTime - chapters[0].startTime;
  if (totalDuration <= 0) return null;

  return (
    <div className="flex h-2 w-full shrink-0 gap-px overflow-hidden px-3" role="navigation" aria-label="Chapter navigation">
      {chapters.map((chapter) => {
        const width =
          ((chapter.endTime - chapter.startTime) / totalDuration) * 100;
        const isActive = chapter.id === activeChapterId;

        return (
          <button
            key={chapter.id}
            type="button"
            onClick={() => onChapterClick(chapter.id)}
            className={cn(
              'h-full rounded-full transition-colors',
              isActive
                ? 'bg-foreground/30'
                : 'bg-muted-foreground/15 hover:bg-muted-foreground/25',
            )}
            style={{ width: `${Math.max(width, MIN_SEGMENT_WIDTH_PCT)}%` }}
            aria-label={`Chapter: ${formatTime(chapter.startTime)} to ${formatTime(chapter.endTime)}`}
          />
        );
      })}
    </div>
  );
}
