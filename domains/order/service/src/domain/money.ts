import type { OrderItem } from '@smartretailx/api-contracts';
import { OrderValidationError } from './errors.js';

const MAX_DECIMAL_PLACES = 12;

const decimalPlaces = (value: number): number => {
  const [coefficient = '', exponentText = '0'] = value.toString().toLowerCase().split('e');
  const fractionLength = coefficient.split('.')[1]?.length ?? 0;
  const exponent = Number(exponentText);

  return Math.max(0, fractionLength - exponent);
};

const monetaryError = (): OrderValidationError =>
  new OrderValidationError([
    {
      path: 'items.unitPrice',
      message: 'Order monetary values must be representable safely.',
    },
  ]);

export const calculateOrderTotal = (items: readonly OrderItem[]): number => {
  const precision = Math.max(0, ...items.map((item) => decimalPlaces(item.unitPrice)));

  if (precision > MAX_DECIMAL_PLACES) {
    throw monetaryError();
  }

  const scale = 10 ** precision;
  let totalScaled = 0;

  for (const item of items) {
    const unitPriceScaled = Math.round(item.unitPrice * scale);
    const lineTotalScaled = unitPriceScaled * item.quantity;

    if (!Number.isSafeInteger(unitPriceScaled) || !Number.isSafeInteger(lineTotalScaled)) {
      throw monetaryError();
    }

    totalScaled += lineTotalScaled;
    if (!Number.isSafeInteger(totalScaled)) {
      throw monetaryError();
    }
  }

  return totalScaled / scale;
};
