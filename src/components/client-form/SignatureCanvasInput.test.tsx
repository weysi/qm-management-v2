import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { SignatureCanvasInput } from './SignatureCanvasInput';

function mockCanvasApis() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,dGVzdA==',
  );
  vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback: BlobCallback) => {
      callback(new Blob(['test'], { type: 'image/png' }));
    });
}

describe('SignatureCanvasInput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports PNG data URL via onChange when user draws and saves', async () => {
    mockCanvasApis();
    const onChange = vi.fn();
    const { container } = render(<SignatureCanvasInput onChange={onChange} />);

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        width: 900,
        height: 220,
        top: 0,
        left: 0,
        right: 900,
        bottom: 220,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(canvas);

    fireEvent.click(screen.getByRole('button', { name: /signatur übernehmen/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('data:image/png;base64,dGVzdA==');
    });
  });
});
