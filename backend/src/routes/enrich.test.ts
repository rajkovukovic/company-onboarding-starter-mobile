import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { afterEach, beforeEach } from 'node:test';

import express from 'express';

import { enrichRouter } from './enrich';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type TestResponse = {
  statusCode: number;
  body: any;
};

type DetailedMockFetchEntry = {
  status?: number;
  body: JsonValue | string;
  contentType?: string;
};

type MockFetchEntry =
  | JsonValue
  | string
  | DetailedMockFetchEntry;

const originalFetch = globalThis.fetch;
const originalCompaniesHouseApiKey = process.env.COMPANIES_HOUSE_API_KEY;
const originalCompaniesHouseBaseUrl = process.env.COMPANIES_HOUSE_BASE_URL;
const originalOpenAIApiKey = process.env.OPENAI_API_KEY;
const originalOpenAIModel = process.env.OPENAI_MODEL;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/enrich', enrichRouter);
  return app;
}

async function withApp<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function postJson(baseUrl: string, payload: unknown): Promise<TestResponse> {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = request(
      `${baseUrl}/enrich`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            body: rawBody ? JSON.parse(rawBody) : undefined,
          });
        });
      }
    );

    req.on('error', reject);
    req.end(body);
  });
}

function isDetailedMockFetchEntry(
  entry: MockFetchEntry
): entry is DetailedMockFetchEntry {
  return typeof entry === 'object' && entry !== null && 'body' in entry;
}

function mockFetch(responses: Record<string, MockFetchEntry>) {
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = new URL(input.toString());
    const key =
      url.hostname.endsWith('company-information.service.gov.uk')
        ? `${url.pathname}${url.search}`
        : url.toString();
    calls.push(key);
    const entry = responses[key];

    if (!entry) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isDetailedEntry = isDetailedMockFetchEntry(entry);
    const status = isDetailedEntry ? entry.status ?? 200 : 200;
    const body = isDetailedEntry ? entry.body : entry;
    const contentType =
      isDetailedEntry && entry.contentType
        ? entry.contentType
        : typeof body === 'string'
          ? 'text/html'
          : 'application/json';

    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      {
        status,
        headers: { 'Content-Type': contentType },
      }
    );
  };

  return calls;
}

function mockCompaniesHouse(responses: Record<string, MockFetchEntry>) {
  return mockFetch(responses);
}

function mockWebsitePage(website: string, html: string) {
  return mockFetch({
    [website]: {
      body: html,
      contentType: 'text/html',
    },
  });
}

beforeEach(() => {
  delete process.env.COMPANIES_HOUSE_API_KEY;
  delete process.env.COMPANIES_HOUSE_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  if (originalCompaniesHouseApiKey === undefined) {
    delete process.env.COMPANIES_HOUSE_API_KEY;
  } else {
    process.env.COMPANIES_HOUSE_API_KEY = originalCompaniesHouseApiKey;
  }

  if (originalCompaniesHouseBaseUrl === undefined) {
    delete process.env.COMPANIES_HOUSE_BASE_URL;
  } else {
    process.env.COMPANIES_HOUSE_BASE_URL = originalCompaniesHouseBaseUrl;
  }

  if (originalOpenAIApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIApiKey;
  }

  if (originalOpenAIModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalOpenAIModel;
  }

  globalThis.fetch = originalFetch;
});

test('returns 400 when email or website is missing', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, { email: 'founder@example.com' });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'Email and website are required',
    });
  });
});

test('returns 400 when email is invalid', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'not-an-email',
      website: 'example.com',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'A valid email is required',
    });
  });
});

test('returns 400 when website is invalid', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'not-a-domain',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'A valid company website is required',
    });
  });
});

test('returns 400 when website looks like an email address', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'manu@seapoint.co',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'A valid company website is required',
    });
  });
});

test('returns 400 when email contains invalid domain characters', async () => {
  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'manu@seapoint,co',
      website: 'seapoint.co',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      error: 'A valid email is required',
    });
  });
});

test('normalizes website and uses website data when Companies House is unavailable', async () => {
  mockWebsitePage(
    'https://example.com/about',
    '<html><head><title>Example Ltd | Home</title></head></html>'
  );

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'www.example.com/about?utm_source=test#team',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.input, {
      email: 'founder@example.com',
      website: 'https://example.com/about',
      domain: 'example.com',
    });
    assert.deepEqual(response.body.company, {
      name: 'Example Ltd',
    });
    assert.deepEqual(response.body.enrichment.sources, ['Company Website']);
    assert.deepEqual(response.body.enrichment.fields.name, {
      sources: ['Company Website'],
      confidence: 'medium',
      reason: 'found in company website metadata or page title',
    });
    assert.match(
      response.body.enrichment.warnings.at(-1),
      /COMPANIES_HOUSE_API_KEY is not configured/
    );
  });
});

test('maps a high-confidence Companies House match into structured company data', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  const calls = mockCompaniesHouse({
    'https://acme.co.uk/': '<html><head><title>Acme | Home</title></head></html>',
    '/search/companies?q=acme&items_per_page=5': {
      items: [
        {
          title: 'ACME LIMITED',
          company_number: '12345678',
          company_status: 'active',
          company_type: 'ltd',
          date_of_creation: '2019-03-15',
        },
      ],
    },
    '/company/12345678': {
      company_name: 'ACME LIMITED',
      company_number: '12345678',
      company_status: 'active',
      type: 'ltd',
      date_of_creation: '2019-03-15',
      registered_office_address: {
        address_line_1: '123 Main Street',
        address_line_2: 'Suite 400',
        locality: 'London',
        region: 'Greater London',
        postal_code: 'EC1A 1BB',
        country: 'United Kingdom',
      },
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'https://www.acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [
      'https://acme.co.uk/',
      '/search/companies?q=acme&items_per_page=5',
      '/company/12345678',
    ]);
    assert.deepEqual(response.body.input, {
      email: 'founder@example.com',
      website: 'https://acme.co.uk',
      domain: 'acme.co.uk',
    });
    assert.deepEqual(response.body.company, {
      name: 'ACME LIMITED',
      registrationNumber: '12345678',
      status: 'active',
      incorporationDate: '2019-03-15',
      companyType: 'ltd',
      registeredAddress: {
        line1: '123 Main Street',
        line2: 'Suite 400',
        city: 'London',
        region: 'Greater London',
        postalCode: 'EC1A 1BB',
        country: 'United Kingdom',
      },
    });
    assert.deepEqual(response.body.enrichment.sources, [
      'Company Website',
      'Companies House',
    ]);

    for (const field of [
      'name',
      'registrationNumber',
      'status',
      'incorporationDate',
      'companyType',
      'registeredAddress',
    ]) {
      assert.equal(response.body.enrichment.fields[field].confidence, 'high');
      assert.deepEqual(response.body.enrichment.fields[field].sources, [
        'Companies House',
      ]);
      assert.equal(typeof response.body.enrichment.fields[field].reason, 'string');
      assert.ok(response.body.enrichment.fields[field].reason.length > 0);
    }
  });
});

test('uses OpenAI website interpretation to choose the primary company and industry', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  const websiteHtml = `
    <html>
      <body>
        <nav>Legal Privacy policy Terms & conditions Cookie policy Complaints handling Cookie settings</nav>
        <p>Seapoint Finance UK Limited is a distributor of Modulr FS Limited, a company registered in England and Wales with company number 09897919, which is authorised and regulated by the Financial Conduct Authority as an Electronic Money Institution.</p>
        <p>Seapoint Finance UK Investments Ltd (FRN: 1039246) is an appointed representative of Wealthkernel Limited.</p>
        <p>Yapily Connect Limited also provides account information service & payment initiation service.</p>
        <footer>© 2026 Seapoint Finance UK Limited. All rights reserved.</footer>
      </body>
    </html>
  `;
  const calls = mockFetch({
    'https://seapoint.co/': websiteHtml,
    'https://api.openai.com/v1/responses': {
      body: {
        output_text: JSON.stringify({
          companyName: 'Seapoint Finance UK Limited',
          industry: 'Financial Technology / Payments and Investments',
          confidence: 'high',
          reason:
            'The website states Seapoint Finance UK Limited is the distributor and repeats it in the copyright notice; other companies are providers or partners.',
          userFacingWarning: null,
          rejectedNames: [
            'Modulr FS Limited',
            'Wealthkernel Limited',
            'Yapily Connect Limited',
          ],
        }),
      },
      contentType: 'application/json',
    },
    '/search/companies?q=Seapoint%20Finance%20UK%20Limited&items_per_page=5': {
      items: [
        {
          title: 'SEAPOINT FINANCE UK LIMITED',
          company_number: '16400001',
          company_status: 'active',
          company_type: 'ltd',
        },
      ],
    },
    '/company/16400001': {
      company_name: 'SEAPOINT FINANCE UK LIMITED',
      company_number: '16400001',
      company_status: 'active',
      type: 'ltd',
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@seapoint.co',
      website: 'seapoint.co',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [
      'https://seapoint.co/',
      'https://api.openai.com/v1/responses',
      '/search/companies?q=Seapoint%20Finance%20UK%20Limited&items_per_page=5',
      '/company/16400001',
    ]);
    assert.equal(response.body.company.name, 'SEAPOINT FINANCE UK LIMITED');
    assert.equal(response.body.company.registrationNumber, '16400001');
    assert.equal(
      response.body.company.industry,
      'Financial Technology / Payments and Investments'
    );
    assert.deepEqual(response.body.enrichment.fields.name.sources, [
      'Company Website',
      'Companies House',
    ]);
    assert.equal(response.body.enrichment.fields.name.confidence, 'high');
    assert.match(
      response.body.enrichment.fields.name.reason,
      /OpenAI interpretation of company website evidence/
    );
    assert.deepEqual(response.body.enrichment.fields.industry, {
      sources: ['Company Website'],
      confidence: 'high',
      reason:
        'interpreted from company website evidence: The website states Seapoint Finance UK Limited is the distributor and repeats it in the copyright notice; other companies are providers or partners.',
    });
  });
});

test('returns partial data with a warning when Companies House has no usable match', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  mockCompaniesHouse({
    'https://unknown-company.co.uk/': {
      status: 404,
      body: 'not found',
      contentType: 'text/plain',
    },
    '/search/companies?q=unknown%20company&items_per_page=5': {
      items: [],
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'unknown-company.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.input, {
      email: 'founder@example.com',
      website: 'https://unknown-company.co.uk',
      domain: 'unknown-company.co.uk',
    });
    assert.deepEqual(response.body.company, {
      name: 'Unknown Company',
    });
    assert.deepEqual(response.body.enrichment.sources, ['Company Website']);
    assert.deepEqual(response.body.enrichment.fields.name, {
      sources: ['Company Website'],
      confidence: 'low',
      reason: 'derived from the normalized company website domain',
    });
    assert.match(
      response.body.enrichment.warnings.at(-1),
      /No usable Companies House match found/
    );
  });
});

test('keeps website enrichment when Companies House rejects the API key', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'invalid-key';
  mockFetch({
    'https://acme.co.uk/':
      '<html><head><meta property="og:site_name" content="Acme"></head></html>',
    '/search/companies?q=acme&items_per_page=5': {
      status: 401,
      body: { error: 'unauthorised' },
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.company, {
      name: 'Acme',
    });
    assert.deepEqual(response.body.enrichment.sources, ['Company Website']);
    assert.deepEqual(response.body.enrichment.fields.name, {
      sources: ['Company Website'],
      confidence: 'medium',
      reason: 'found in company website metadata or page title',
    });
    assert.match(
      response.body.enrichment.warnings.at(-1),
      /Companies House returned 401/
    );
  });
});

test('uses a configured Companies House base URL', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  process.env.COMPANIES_HOUSE_BASE_URL =
    'https://api-sandbox.company-information.service.gov.uk';
  const calls = mockFetch({
    'https://acme.co.uk/': '<html><head><title>Acme</title></head></html>',
    '/search/companies?q=acme&items_per_page=5': {
      items: [
        {
          title: 'ACME LIMITED',
          company_number: '12345678',
        },
      ],
    },
    '/company/12345678': {
      company_name: 'ACME LIMITED',
      company_number: '12345678',
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@example.com',
      website: 'acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [
      'https://acme.co.uk/',
      '/search/companies?q=acme&items_per_page=5',
      '/company/12345678',
    ]);
    assert.equal(response.body.company.registrationNumber, '12345678');
  });
});

test('warns when a personal email domain is used', async () => {
  mockWebsitePage(
    'https://acme.co.uk/',
    '<html><head><title>Acme</title></head></html>'
  );

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@gmail.com',
      website: 'acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.match(
      response.body.enrichment.warnings[0],
      /Personal email domains are less reliable/
    );
    assert.equal(response.body.company.name, 'Acme');
  });
});

test('warns when email and website domains do not match', async () => {
  mockWebsitePage(
    'https://acme.co.uk/',
    '<html><head><title>Acme</title></head></html>'
  );

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@other-company.co.uk',
      website: 'acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.match(
      response.body.enrichment.warnings[0],
      /does not match website domain/
    );
    assert.equal(response.body.company.name, 'Acme');
  });
});

test('warns when Companies House has multiple plausible matches', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  mockCompaniesHouse({
    'https://acme.co.uk/': '<html><head><title>Acme</title></head></html>',
    '/search/companies?q=acme&items_per_page=5': {
      items: [
        {
          title: 'ACME LIMITED',
          company_number: '12345678',
        },
        {
          title: 'ACME SERVICES LIMITED',
          company_number: '87654321',
        },
      ],
    },
    '/company/12345678': {
      company_name: 'ACME LIMITED',
      company_number: '12345678',
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@acme.co.uk',
      website: 'acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.company.registrationNumber, '12345678');
    assert.ok(
      response.body.enrichment.warnings.some((warning: string) =>
        warning.includes('Multiple Companies House matches found')
      )
    );
  });
});

test('adds a wrong-environment hint when a configured Companies House host rejects auth', async () => {
  process.env.COMPANIES_HOUSE_API_KEY = 'test-key';
  process.env.COMPANIES_HOUSE_BASE_URL =
    'https://api-sandbox.company-information.service.gov.uk';
  mockFetch({
    'https://acme.co.uk/': '<html><head><title>Acme</title></head></html>',
    '/search/companies?q=acme&items_per_page=5': {
      status: 401,
      body: { error: 'unauthorised' },
    },
  });

  await withApp(async (baseUrl) => {
    const response = await postJson(baseUrl, {
      email: 'founder@acme.co.uk',
      website: 'acme.co.uk',
    });

    assert.equal(response.statusCode, 200);
    assert.match(
      response.body.enrichment.warnings.at(-1),
      /COMPANIES_HOUSE_BASE_URL matches the API key environment/
    );
    assert.equal(response.body.company.name, 'Acme');
  });
});
