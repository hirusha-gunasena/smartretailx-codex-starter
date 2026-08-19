import { sleep } from 'k6';
import { browseCatalogue } from './common.js';

export const options = {
  stages: [
    { duration: '10s', target: 100 }, // fast ramp-up
    { duration: '1m', target: 100 },  // normal load
    { duration: '10s', target: 500 }, // sudden spike
    { duration: '3m', target: 500 },  // stay at spike
    { duration: '10s', target: 100 }, // scale down
    { duration: '3m', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // allow some degradation during spikes
  },
};

export default function () {
  browseCatalogue();
  sleep(1);
}
