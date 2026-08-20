import { sleep } from 'k6';
import { browseCatalogue } from './common.js';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // below normal load
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 }, // normal load
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 }, // around breaking point
    { duration: '5m', target: 300 },
    { duration: '2m', target: 400 }, // beyond breaking point
    { duration: '5m', target: 400 },
    { duration: '5m', target: 0 }, // scale down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  browseCatalogue();
  sleep(1);
}
