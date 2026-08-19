import { sleep } from 'k6';
import { browseCatalogue } from './common.js';

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // ramp up to 50 users
    { duration: '3m', target: 50 }, // stay at 50 users for 3m
    { duration: '1m', target: 0 },  // ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests must complete below 1s
    http_req_failed: ['rate<0.01'], // less than 1% errors
  },
};

export default function () {
  browseCatalogue();
  sleep(1);
}
