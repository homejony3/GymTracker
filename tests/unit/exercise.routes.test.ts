import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock exercise service
vi.mock('@/services/exercise.service', () => ({
  createExercise: vi.fn(),
  getExercisesBySplit: vi.fn(),
  updateExerciseName: vi.fn(),
  removeExerciseFromSplit: vi.fn(),
  ExerciseValidationError: class ExerciseValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ExerciseValidationError';
    }
  },
  ExerciseDuplicateError: class ExerciseDuplicateError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ExerciseDuplicateError';
    }
  },
  ExerciseNotFoundError: class ExerciseNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ExerciseNotFoundError';
    }
  },
}));

// Mock db pool
vi.mock('@/lib/db', () => ({
  pool: { query: vi.fn() },
}));

import {
  createExercise,
  getExercisesBySplit,
  updateExerciseName,
  removeExerciseFromSplit,
  ExerciseValidationError,
  ExerciseDuplicateError,
  ExerciseNotFoundError,
} from '@/services/exercise.service';
import { GET, POST } from '@/app/api/exercises/route';
import { PUT, DELETE } from '@/app/api/exercises/[id]/route';

const mockCreateExercise = createExercise as ReturnType<typeof vi.fn>;
const mockGetExercisesBySplit = getExercisesBySplit as ReturnType<typeof vi.fn>;
const mockUpdateExerciseName = updateExerciseName as ReturnType<typeof vi.fn>;
const mockRemoveExerciseFromSplit = removeExerciseFromSplit as ReturnType<typeof vi.fn>;

function createGetRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers: { ...headers },
  });
}

function createPostRequest(url: string, body?: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function createPutRequest(url: string, body?: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function createDeleteRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { ...headers },
  });
}

describe('GET /api/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when x-user-id header is missing', async () => {
    const request = createGetRequest('http://localhost:3000/api/exercises?split=UPPER');
    const response = await GET(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 when split query param is missing', async () => {
    const request = createGetRequest('http://localhost:3000/api/exercises', {
      'x-user-id': 'user-1',
    });
    const response = await GET(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing required query parameter: split');
  });

  it('should return 400 when split value is invalid', async () => {
    const request = createGetRequest('http://localhost:3000/api/exercises?split=LEGS', {
      'x-user-id': 'user-1',
    });
    const response = await GET(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid split value');
  });

  it('should return exercises for a valid split', async () => {
    const mockExercises = [
      { id: 'ex-1', userId: 'user-1', name: 'Bench Press', weightIncrement: 1.0, splits: ['UPPER'], createdAt: new Date() },
    ];
    mockGetExercisesBySplit.mockResolvedValueOnce(mockExercises);

    const request = createGetRequest('http://localhost:3000/api/exercises?split=UPPER', {
      'x-user-id': 'user-1',
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.exercises).toHaveLength(1);
    expect(data.exercises[0].name).toBe('Bench Press');
    expect(mockGetExercisesBySplit).toHaveBeenCalledWith('user-1', 'UPPER');
  });

  it('should return empty array when no exercises exist for split', async () => {
    mockGetExercisesBySplit.mockResolvedValueOnce([]);

    const request = createGetRequest('http://localhost:3000/api/exercises?split=LOWER', {
      'x-user-id': 'user-1',
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.exercises).toHaveLength(0);
  });
});

describe('POST /api/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when x-user-id header is missing', async () => {
    const request = createPostRequest('http://localhost:3000/api/exercises', {
      name: 'Bench Press',
      split: 'UPPER',
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid JSON body', async () => {
    const request = new NextRequest('http://localhost:3000/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-1' },
      body: 'invalid json{',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid request body');
  });

  it('should return 400 when name is missing', async () => {
    const request = createPostRequest('http://localhost:3000/api/exercises', { split: 'UPPER' }, {
      'x-user-id': 'user-1',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('name');
  });

  it('should return 400 when split is missing', async () => {
    const request = createPostRequest('http://localhost:3000/api/exercises', { name: 'Bench Press' }, {
      'x-user-id': 'user-1',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('split');
  });

  it('should return 400 when split value is invalid', async () => {
    const request = createPostRequest('http://localhost:3000/api/exercises', {
      name: 'Bench Press',
      split: 'CHEST',
    }, { 'x-user-id': 'user-1' });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid split value');
  });

  it('should return 400 for validation errors (name too short/long)', async () => {
    mockCreateExercise.mockRejectedValueOnce(
      new ExerciseValidationError('Exercise name must be between 1 and 50 characters')
    );

    const request = createPostRequest('http://localhost:3000/api/exercises', {
      name: '',
      split: 'UPPER',
    }, { 'x-user-id': 'user-1' });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Exercise name must be between');
  });

  it('should return 409 for duplicate exercise name', async () => {
    mockCreateExercise.mockRejectedValueOnce(
      new ExerciseDuplicateError('Exercise name already exists in this split')
    );

    const request = createPostRequest('http://localhost:3000/api/exercises', {
      name: 'Bench Press',
      split: 'UPPER',
    }, { 'x-user-id': 'user-1' });
    const response = await POST(request);
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe('Exercise name already exists in this split');
  });

  it('should return 201 with created exercise on success', async () => {
    const mockExercise = {
      id: 'ex-1',
      userId: 'user-1',
      name: 'Bench Press',
      weightIncrement: 1.0,
      splits: ['UPPER'],
      createdAt: new Date('2024-01-01'),
    };
    mockCreateExercise.mockResolvedValueOnce(mockExercise);

    const request = createPostRequest('http://localhost:3000/api/exercises', {
      name: 'Bench Press',
      split: 'UPPER',
    }, { 'x-user-id': 'user-1' });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.exercise.id).toBe('ex-1');
    expect(data.exercise.name).toBe('Bench Press');
    expect(mockCreateExercise).toHaveBeenCalledWith('user-1', 'Bench Press', 'UPPER');
  });
});

describe('PUT /api/exercises/[id]', () => {
  const mockParams = Promise.resolve({ id: 'ex-1' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when x-user-id header is missing', async () => {
    const request = createPutRequest('http://localhost:3000/api/exercises/ex-1', {
      name: 'New Name',
    });
    const response = await PUT(request, { params: mockParams });
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 for invalid JSON body', async () => {
    const request = new NextRequest('http://localhost:3000/api/exercises/ex-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'user-1' },
      body: 'invalid json{',
    });
    const response = await PUT(request, { params: mockParams });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid request body');
  });

  it('should return 400 when name is missing from body', async () => {
    const request = createPutRequest('http://localhost:3000/api/exercises/ex-1', {}, {
      'x-user-id': 'user-1',
    });
    const response = await PUT(request, { params: mockParams });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('name');
  });

  it('should return 400 for validation errors', async () => {
    mockUpdateExerciseName.mockRejectedValueOnce(
      new ExerciseValidationError('Exercise name must be between 1 and 50 characters')
    );

    const request = createPutRequest('http://localhost:3000/api/exercises/ex-1', {
      name: '   ',
    }, { 'x-user-id': 'user-1' });
    const response = await PUT(request, { params: mockParams });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Exercise name must be between');
  });

  it('should return 404 when exercise is not found', async () => {
    mockUpdateExerciseName.mockRejectedValueOnce(
      new ExerciseNotFoundError('Exercise not found')
    );

    const request = createPutRequest('http://localhost:3000/api/exercises/ex-999', {
      name: 'New Name',
    }, { 'x-user-id': 'user-1' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'ex-999' }) });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Exercise not found');
  });

  it('should return 409 for duplicate name', async () => {
    mockUpdateExerciseName.mockRejectedValueOnce(
      new ExerciseDuplicateError('Exercise name already exists in this split')
    );

    const request = createPutRequest('http://localhost:3000/api/exercises/ex-1', {
      name: 'Existing Name',
    }, { 'x-user-id': 'user-1' });
    const response = await PUT(request, { params: mockParams });
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe('Exercise name already exists in this split');
  });

  it('should return 200 with updated exercise on success', async () => {
    const mockExercise = {
      id: 'ex-1',
      userId: 'user-1',
      name: 'Incline Bench Press',
      weightIncrement: 1.0,
      splits: ['UPPER'],
      createdAt: new Date('2024-01-01'),
    };
    mockUpdateExerciseName.mockResolvedValueOnce(mockExercise);

    const request = createPutRequest('http://localhost:3000/api/exercises/ex-1', {
      name: 'Incline Bench Press',
    }, { 'x-user-id': 'user-1' });
    const response = await PUT(request, { params: mockParams });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.exercise.name).toBe('Incline Bench Press');
    expect(mockUpdateExerciseName).toHaveBeenCalledWith('user-1', 'ex-1', 'Incline Bench Press');
  });
});

describe('DELETE /api/exercises/[id]', () => {
  const mockParams = Promise.resolve({ id: 'ex-1' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when x-user-id header is missing', async () => {
    const request = createDeleteRequest('http://localhost:3000/api/exercises/ex-1?split=UPPER');
    const response = await DELETE(request, { params: mockParams });
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 400 when split query param is missing', async () => {
    const request = createDeleteRequest('http://localhost:3000/api/exercises/ex-1', {
      'x-user-id': 'user-1',
    });
    const response = await DELETE(request, { params: mockParams });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing required query parameter: split');
  });

  it('should return 400 when split value is invalid', async () => {
    const request = createDeleteRequest('http://localhost:3000/api/exercises/ex-1?split=CHEST', {
      'x-user-id': 'user-1',
    });
    const response = await DELETE(request, { params: mockParams });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid split value');
  });

  it('should return 404 when exercise is not found', async () => {
    mockRemoveExerciseFromSplit.mockRejectedValueOnce(
      new ExerciseNotFoundError('Exercise not found')
    );

    const request = createDeleteRequest('http://localhost:3000/api/exercises/ex-999?split=UPPER', {
      'x-user-id': 'user-1',
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'ex-999' }) });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Exercise not found');
  });

  it('should return 404 when exercise is not associated with the split', async () => {
    mockRemoveExerciseFromSplit.mockRejectedValueOnce(
      new ExerciseNotFoundError('Exercise is not associated with this split')
    );

    const request = createDeleteRequest('http://localhost:3000/api/exercises/ex-1?split=LOWER', {
      'x-user-id': 'user-1',
    });
    const response = await DELETE(request, { params: mockParams });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Exercise is not associated with this split');
  });

  it('should return 200 with success on successful removal', async () => {
    mockRemoveExerciseFromSplit.mockResolvedValueOnce(undefined);

    const request = createDeleteRequest('http://localhost:3000/api/exercises/ex-1?split=UPPER', {
      'x-user-id': 'user-1',
    });
    const response = await DELETE(request, { params: mockParams });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockRemoveExerciseFromSplit).toHaveBeenCalledWith('user-1', 'ex-1', 'UPPER');
  });
});
