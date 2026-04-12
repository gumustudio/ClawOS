import { buildSearchKeywords, cleanupTrackTitle, inferTitleArtistFromFilename } from './musicCache';

export interface MinimalLocalTrack {
  path: string;
  name: string;
  artist: string;
}

export interface NeteaseSongCandidate {
  name?: string;
  ar?: Array<{ name?: string }>;
}

export const normalizeValue = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s._\-()[\]{}【】（）'"`~!@#$%^&*+=|\\/:;<>,?，。！？、·]+/g, '');

export const scoreSearchMatch = (track: MinimalLocalTrack, candidate: NeteaseSongCandidate) => {
  const inferred = inferTitleArtistFromFilename(track.path);
  const targetTitle = normalizeValue(cleanupTrackTitle(track.name || inferred.title));
  const targetArtist = normalizeValue(track.artist !== 'Unknown Artist' ? track.artist : inferred.artist);
  const songTitle = normalizeValue(cleanupTrackTitle(candidate.name || ''));
  const songArtist = normalizeValue(candidate.ar?.[0]?.name || '');

  let score = 0;
  if (songTitle === targetTitle) score += 10;
  if (songTitle.includes(targetTitle) || targetTitle.includes(songTitle)) score += 4;
  if (targetArtist && songArtist === targetArtist) score += 8;
  if (targetArtist && (songArtist.includes(targetArtist) || targetArtist.includes(songArtist))) score += 3;
  return score;
};

export const buildTrackSearchKeywords = (track: MinimalLocalTrack) => {
  const inferred = inferTitleArtistFromFilename(track.path);
  const effectiveArtist = track.artist !== 'Unknown Artist' ? track.artist : inferred.artist;
  const effectiveTitle = track.name && track.artist === 'Unknown Artist' ? inferred.title : (track.name || inferred.title);
  return buildSearchKeywords(effectiveTitle, effectiveArtist);
};
