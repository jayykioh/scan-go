/**
 * Pack-size parser tests. Every case below is a real product name observed on
 * the WinMart listing on 2026-10-06, because the failure this guards against is
 * a unit misread that silently corrupts `unitCostVnd` and gross profit.
 */
import { describe, expect, it } from 'vitest';
import { parsePackSize, pricePerBaseUnit } from './pack-size.js';

describe('parsePackSize on real retail names', () => {
  it('reads a plain gram pack', () => {
    expect(parsePackSize('Giá đỗ WinEco 300g')).toMatchObject({
      quantity: 300,
      baseUnit: 'g',
      confidence: 'high',
    });
  });

  it('reads a labelled pack whose container shares the size number', () => {
    // `gói 300g` is one 300g pack; the container word is a label, not a count.
    expect(parsePackSize('Cải bó xôi WinEco gói 300g')).toMatchObject({
      quantity: 300,
      baseUnit: 'g',
      confidence: 'high',
    });
  });

  it('reads a count of eggs from the container', () => {
    expect(parsePackSize("Trứng gà sạch O'LALA hộp 10 quả")).toMatchObject({
      quantity: 10,
      baseUnit: 'unit',
      confidence: 'high',
    });
  });

  it('reads a basket of eggs', () => {
    expect(parsePackSize('Trứng gà ta quê 729 Ba Vì giỏ 10 quả')).toMatchObject({
      quantity: 10,
      baseUnit: 'unit',
      confidence: 'high',
    });
  });

  it('converts kilograms to grams', () => {
    expect(parsePackSize('Thịt bò 1.5kg')).toMatchObject({
      quantity: 1500,
      baseUnit: 'g',
      confidence: 'high',
    });
  });

  it('returns null when the name carries no size', () => {
    expect(parsePackSize('Tim heo')).toBeNull();
    expect(parsePackSize('Cần tây lớn WinEco')).toBeNull();
    expect(parsePackSize('Đùi bò')).toBeNull();
  });

  it('flags a multipack as low confidence', () => {
    // 48 pouches of 180ml: dividing the price by 180ml alone understates Cost.
    expect(
      parsePackSize(
        'Thùng 48 túi sữa tươi tiệt trùng Cô gái Hà Lan có đường 180ml',
      ),
    ).toMatchObject({ baseUnit: 'ml', confidence: 'low' });
  });

  it('flags two competing sizes as low confidence', () => {
    expect(parsePackSize('Combo 2 gói 500g')).toMatchObject({
      confidence: 'low',
    });
  });

  it('does not read a unit word that has no number in front of it', () => {
    // `Cải bó xôi` contains the count word `bó` with no quantity.
    expect(parsePackSize('Cải bó xôi')).toBeNull();
  });
});

describe('pricePerBaseUnit', () => {
  it('divides a pack price by its size', () => {
    const size = parsePackSize('Giá đỗ WinEco 300g');
    expect(pricePerBaseUnit(10000, size)).toEqual({
      unitCostVnd: 33,
      baseUnit: 'g',
    });
  });

  it('prices one egg from a ten-egg box', () => {
    const size = parsePackSize("Trứng gà sạch O'LALA hộp 10 quả");
    expect(pricePerBaseUnit(39000, size)).toEqual({
      unitCostVnd: 3900,
      baseUnit: 'unit',
    });
  });

  it('refuses to convert a missing or ambiguous size', () => {
    expect(pricePerBaseUnit(100000, null)).toBeNull();
    expect(
      pricePerBaseUnit(373300, parsePackSize('Thùng 48 túi sữa 180ml')),
    ).toBeNull();
  });
});
