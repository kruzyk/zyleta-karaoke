import type { Song } from '@/types/song';
import styles from './SongItem.module.css';

interface SongItemProps {
  song: Song;
}

export function SongItem({ song }: SongItemProps) {
  return (
    <div className={styles.item} role="listitem">
      <span className={styles.artist}>{song.artist}</span>
      <span className={styles.separator}> — </span>
      <span className={styles.title}>{song.title}</span>
    </div>
  );
}
