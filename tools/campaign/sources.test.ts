import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ART_DIR,
  cachePath,
  candidateSchema,
  parseCommons,
  parseOpenverse,
  parsePexels,
  parsePixabay,
  parseWallhaven,
  plainText,
  usable,
} from './sources';

// Trimmed copies of each source's answer, with the fields the parsers read.

const pexels = {
  page: 1,
  per_page: 40,
  photos: [
    {
      id: 17440100,
      width: 6916,
      height: 4614,
      url: 'https://www.pexels.com/photo/buds-of-leaves-17440100/',
      photographer: 'Tri Warno',
      photographer_url: 'https://www.pexels.com/@triew0814',
      alt: 'Macro shot of green fern fiddleheads.',
      src: {
        original: 'https://images.pexels.com/photos/17440100/pexels-photo-17440100.jpeg',
        medium:
          'https://images.pexels.com/photos/17440100/pexels-photo-17440100.jpeg?auto=compress&h=350',
      },
    },
    { id: 2, width: 10, height: 10, src: {} },
  ],
};

const wallhaven = {
  data: [
    {
      id: '8xd9zo',
      url: 'https://wallhaven.cc/w/8xd9zo',
      path: 'https://w.wallhaven.cc/full/8x/wallhaven-8xd9zo.jpg',
      source: 'https://www.artstation.com/artwork/abc',
      dimension_x: 2000,
      dimension_y: 1272,
      thumbs: { small: 'https://th.wallhaven.cc/small/8x/8xd9zo.jpg' },
    },
    {
      id: 'zz11yy',
      url: 'https://wallhaven.cc/w/zz11yy',
      path: 'https://w.wallhaven.cc/full/zz/wallhaven-zz11yy.png',
      source: 'not a link',
      dimension_x: 1920,
      dimension_y: 1080,
      thumbs: { small: 'https://th.wallhaven.cc/small/zz/zz11yy.jpg' },
    },
  ],
};

const openverse = {
  results: [
    {
      id: '4bc1-77',
      title: 'Mushrooms',
      creator: 'A. Painter',
      creator_url: 'https://example.org/a-painter',
      url: 'https://live.staticflickr.com/1/2_o.jpg',
      thumbnail: 'https://api.openverse.org/v1/images/4bc1-77/thumb/',
      foreign_landing_url: 'https://www.flickr.com/photos/a/2',
      provider: 'flickr',
      license: 'by-sa',
      license_version: '2.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/2.0/',
      category: 'photograph',
      width: 3000,
      height: 2000,
    },
    {
      id: '9f',
      url: 'https://upload.wikimedia.org/a.png',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:A.png',
      source: 'wikimedia',
      license: 'pdm',
      license_version: '1.0',
      category: 'illustration',
      width: 1600,
      height: 900,
    },
  ],
};

const commons = {
  query: {
    pages: {
      '12': {
        index: 2,
        title: 'File:Second.jpg',
        imageinfo: [
          {
            url: 'https://upload.wikimedia.org/second.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Second.jpg',
            thumburl: 'https://upload.wikimedia.org/thumb/second.jpg/360px-second.jpg',
            width: 4000,
            height: 2500,
            extmetadata: {
              Artist: { value: '<a href="//x">Jane &amp; John</a>' },
              LicenseShortName: { value: 'Public domain' },
            },
          },
        ],
      },
      '11': {
        index: 1,
        title: 'File:First painting.png',
        imageinfo: [
          {
            url: 'https://upload.wikimedia.org/first.png?1',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:First_painting.png',
            width: 3000,
            height: 2000,
            extmetadata: {
              ObjectName: { value: 'A <i>calm</i> lake' },
              LicenseShortName: { value: 'CC BY 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' },
            },
          },
        ],
      },
      '13': { index: 3, title: 'File:No info.jpg' },
    },
  },
};

describe('search parsers', () => {
  it('read Pexels photos with the photographer and the original file', () => {
    const [c, empty] = parsePexels(pexels);
    expect(c).toMatchObject({
      ref: 'pexels:17440100',
      source: 'Pexels',
      kind: 'photo',
      image: 'https://images.pexels.com/photos/17440100/pexels-photo-17440100.jpeg',
      width: 6916,
      height: 4614,
      author: 'Tri Warno',
      authorUrl: 'https://www.pexels.com/@triew0814',
      license: 'Pexels license',
    });
    expect(empty?.image).toBe('');
    expect(usable(parsePexels(pexels)).map((x) => x.ref)).toEqual(['pexels:17440100']);
  });

  it('read wallhaven wallpapers, taking the uploader source only when it is a link', () => {
    const [a, b] = parseWallhaven(wallhaven);
    expect(a).toMatchObject({
      ref: 'wallhaven:8xd9zo',
      kind: 'painting',
      authorUrl: 'https://www.artstation.com/artwork/abc',
      license: null,
    });
    expect(b?.authorUrl).toBeNull();
    expect(usable([a, b].flatMap((x) => (x === undefined ? [] : [x])))).toHaveLength(2);
  });

  it('read Openverse results with their license and kind', () => {
    const [photo, art] = parseOpenverse(openverse);
    expect(photo).toMatchObject({
      ref: 'openverse:4bc1-77',
      source: 'Openverse (flickr)',
      kind: 'photo',
      license: 'CC BY-SA 2.0',
      author: 'A. Painter',
    });
    expect(art).toMatchObject({
      source: 'Openverse (wikimedia)',
      kind: 'painting',
      license: 'PDM',
      thumb: 'https://upload.wikimedia.org/a.png',
    });
  });

  it('read Commons files in search order, as text, without the URL query', () => {
    const results = parseCommons(commons);
    expect(results.map((c) => c.ref)).toEqual(['commons:First painting.png', 'commons:Second.jpg']);
    expect(results[0]).toMatchObject({
      image: 'https://upload.wikimedia.org/first.png',
      thumb: 'https://upload.wikimedia.org/first.png?1',
      title: 'A calm lake',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
    });
    expect(results[1]).toMatchObject({ title: 'Second.jpg', author: 'Jane & John' });
  });

  it('turn Pixabay tiles into 1280 px files, leaving out tiles without an id', () => {
    const results = parsePixabay([
      {
        page: 'https://pixabay.com/illustrations/ship-clouds-5514965/',
        thumb: 'https://cdn.pixabay.com/photo/2020/08/27/ship-5514965_640.png',
        thumbWidth: 640,
        thumbHeight: 427,
        author: 'kirillsl',
        authorUrl: 'https://pixabay.com/users/kirillsl-1/',
        alt: 'Ship, clouds',
      },
      {
        page: 'https://pixabay.com/illustrations/search/ship/',
        thumb: 'https://cdn.pixabay.com/photo/x_640.png',
        thumbWidth: 640,
        thumbHeight: 427,
        author: null,
        authorUrl: null,
        alt: null,
      },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ref: 'pixabay:5514965',
      image: 'https://cdn.pixabay.com/photo/2020/08/27/ship-5514965_1280.png',
      width: 1280,
      height: 854,
      license: 'Pixabay Content License',
    });
  });
});

describe('candidates', () => {
  it('need a known source, links and a picture kind', () => {
    const [c] = parsePexels(pexels);
    expect(candidateSchema.safeParse(c).success).toBe(true);
    expect(candidateSchema.safeParse({ ...c, ref: 'flickr:1' }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...c, page: '' }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...c, kind: 'generated' }).success).toBe(false);
  });

  it('decode HTML once', () => {
    expect(plainText('<b>A</b> &amp;quot;B&amp;quot; &#39;C&#039;&nbsp; ')).toBe(
      `A &quot;B&quot; 'C'`,
    );
  });

  it('cache downloads by URL under the source, keeping the extension', () => {
    const a = cachePath('pexels', 'https://images.pexels.com/photos/1/p.jpeg', 'originals');
    expect(path.dirname(a)).toBe(path.join(ART_DIR, 'pexels', 'originals'));
    expect(a.endsWith('.jpeg')).toBe(true);
    expect(cachePath('pexels', 'https://images.pexels.com/photos/1/p.jpeg', 'originals')).toBe(a);
    expect(cachePath('web', 'https://example.org/image?id=3', 'thumbs').endsWith('.img')).toBe(
      true,
    );
  });
});
