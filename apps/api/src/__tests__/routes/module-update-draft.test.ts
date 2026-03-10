import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { moduleRouter } from '../../routes/module.js';
import type { TenantDb } from '@camello/db';

vi.mock('@camello/ai', () => ({
  getModule: vi.fn(),
  processRejection: vi.fn(),
  generateEmbedding: vi.fn(),
}));

type Any = any;

const TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID  = '00000000-0000-0000-0000-000000000002';
const EXECUTION_ID = '00000000-0000-0000-0000-000000000004';
const USER_ID      = 'user_test_123';

const createCaller = createCallerFactory(moduleRouter);

function mockTenantDb(queryFn: (...args: Any[]) => Any): TenantDb {
  return { query: queryFn, transaction: queryFn } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    tenantId: TENANT_ID,
    tenantDb,
  };
}

const BASE_OUTPUT = {
  draft_text: 'foo',
  topic: 'My Topic',
  content_type: 'social_post',
  status: 'draft',
};

const FAKE_EXECUTION = {
  id: EXECUTION_ID,
  artifactId: ARTIFACT_ID,
  tenantId: TENANT_ID,
  status: 'executed',
  moduleSlug: 'draft_content',
  output: BASE_OUTPUT,
};

/** Build a two-call mock: call 1 = SELECT (fetch), call 2 = UPDATE (write). */
function makeTwoCallDb(fetchRows: Any[], captureUpdate?: (vals: Any) => void): TenantDb {
  let callIdx = 0;
  const queryFn = vi.fn(async (fn: Any) => {
    callIdx++;
    if (callIdx === 1) {
      // SELECT execution
      return fn({
        select: () => ({ from: () => ({ where: () => ({ limit: () => fetchRows }) }) }),
      });
    }
    // UPDATE execution
    return fn({
      update: () => ({
        set: (vals: Any) => {
          captureUpdate?.(vals);
          return {
            where: () => ({
              returning: () => [{ ...FAKE_EXECUTION, output: vals.output }],
            }),
          };
        },
      }),
    });
  });
  return mockTenantDb(queryFn);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('module.updateDraft', () => {
  it('action: approve — sets draft_status to approved', async () => {
    let capturedOutput: Any = null;
    const db = makeTwoCallDb([FAKE_EXECUTION], (vals) => { capturedOutput = vals.output; });

    const caller = createCaller(makeCtx(db));
    await caller.updateDraft({ executionId: EXECUTION_ID, action: 'approve' });

    expect(capturedOutput).toMatchObject({ ...BASE_OUTPUT, draft_status: 'approved' });
  });

  it('action: discard — sets draft_status to discarded', async () => {
    let capturedOutput: Any = null;
    const db = makeTwoCallDb([FAKE_EXECUTION], (vals) => { capturedOutput = vals.output; });

    const caller = createCaller(makeCtx(db));
    await caller.updateDraft({ executionId: EXECUTION_ID, action: 'discard' });

    expect(capturedOutput).toMatchObject({ ...BASE_OUTPUT, draft_status: 'discarded' });
  });

  it('action: edit with output — merges draft_text and sets draft_status approved', async () => {
    let capturedOutput: Any = null;
    const db = makeTwoCallDb([FAKE_EXECUTION], (vals) => { capturedOutput = vals.output; });

    const caller = createCaller(makeCtx(db));
    await caller.updateDraft({
      executionId: EXECUTION_ID,
      action: 'edit',
      output: { draft_text: 'edited content' },
    });

    expect(capturedOutput).toMatchObject({
      ...BASE_OUTPUT,
      draft_text: 'edited content',
      draft_status: 'approved',
    });
    // Other fields preserved
    expect(capturedOutput.topic).toBe('My Topic');
    expect(capturedOutput.content_type).toBe('social_post');
  });

  it('action: edit without output — throws BAD_REQUEST', async () => {
    const db = makeTwoCallDb([FAKE_EXECUTION]);

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.updateDraft({ executionId: EXECUTION_ID, action: 'edit' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('execution not found — throws NOT_FOUND', async () => {
    let callIdx = 0;
    const queryFn = vi.fn(async (fn: Any) => {
      callIdx++;
      if (callIdx === 1) {
        return fn({
          select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
        });
      }
      throw new Error('Should not reach update');
    });
    const db = mockTenantDb(queryFn);

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.updateDraft({ executionId: EXECUTION_ID, action: 'approve' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('execution has status pending — throws BAD_REQUEST', async () => {
    const pendingExecution = { ...FAKE_EXECUTION, status: 'pending' };
    const db = makeTwoCallDb([pendingExecution]);

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.updateDraft({ executionId: EXECUTION_ID, action: 'approve' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('execution has wrong module_slug — throws BAD_REQUEST', async () => {
    const wrongSlugExecution = { ...FAKE_EXECUTION, moduleSlug: 'send_quote' };
    const db = makeTwoCallDb([wrongSlugExecution]);

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.updateDraft({ executionId: EXECUTION_ID, action: 'approve' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
