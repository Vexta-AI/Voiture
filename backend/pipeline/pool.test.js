import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { vehicleFingerprint } from './history.js';
import { compactListing, historyFromPool, mergePoolEntry, repostIndexFromPool } from './pool.js';

const l = (over = {}) => ({
  id: 'lbc-1', type: 'auto', title: 'Peugeot 208 Active', brand: 'Peugeot', model: '208', year: 2018, mileage: 80000, price: 9000,
  marketPrice: 0, publishedAt: '2026-10-01T00:00:00Z', zip: '33000', description: 'Très propre. '.repeat(200), photos: ['https://x/1.jpg'], ...over,
});

describe('Stock compact', () => {
  it('garde l’essentiel, fige l’état « accidentée » et jette la description', () => {
    const c = compactListing(l({ description: 'Vendue accidentée, choc avant' }));
    assert.equal(c.damaged, true);
    assert.equal('description' in c, false);
    assert.ok(JSON.stringify(compactListing(l())).length < 600, 'entrée légère');
  });

  it('fusion : premier prix, plus haut prix, dernière version', () => {
    let e = mergePoolEntry(null, l({ price: 9500 }), '2026-10-02T00:00:00Z');
    e = mergePoolEntry(e, l({ price: 9000 }), '2026-10-05T00:00:00Z');
    e = mergePoolEntry(e, l({ price: 9900 }), '2026-10-01T00:00:00Z'); // relevé plus ancien arrivé en retard
    assert.equal(e.firstSeenAt, '2026-10-01T00:00:00Z');
    assert.equal(e.firstPrice, 9900);
    assert.equal(e.maxPrice, 9900);
    assert.equal(e.listing.price, 9000, 'dernier relevé = prix actuel');
    assert.deepEqual(historyFromPool([e]).get('lbc-1'), { firstSeenAt: '2026-10-01T00:00:00Z', firstPrice: 9900, maxPrice: 9900 });
  });

  it('republication : la plus ancienne annonce du même véhicule', () => {
    const a = mergePoolEntry(null, l({ id: 'lbc-1', publishedAt: '2026-09-01T00:00:00Z' }), '2026-09-02T00:00:00Z');
    const b = mergePoolEntry(null, l({ id: 'lbc-2', publishedAt: '2026-10-10T00:00:00Z', price: 8500 }), '2026-10-10T00:00:00Z');
    const idx = repostIndexFromPool([b, a], vehicleFingerprint);
    assert.equal(idx.get(vehicleFingerprint(l()))?.id, 'lbc-1');
  });
});
