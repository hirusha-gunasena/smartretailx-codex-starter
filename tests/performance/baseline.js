import { sleep } from 'k6';
import { browseCatalogue } from './common.js';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
  },
};

export default function () {
  browseCatalogue();
  sleep(1);
}
