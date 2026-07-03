import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { SimulationProvider, useSimulation } from './use-simulation';

// Simple consumer component to assist hook assertion
const TestConsumer = () => {
  const { inventory, guardSettings, dailySpendUcents, triggerAIProcurement } = useSimulation();
  return (
    <div>
      <span data-testid="compute-level">{inventory.compute.level}</span>
      <span data-testid="coolant-level">{inventory.coolant.level}</span>
      <span data-testid="spend-limit">{guardSettings.dailySpendLimitUcents}</span>
      <span data-testid="daily-spend">{dailySpendUcents}</span>
      <button 
        data-testid="procure-btn"
        onClick={() => triggerAIProcurement('compute', 'Test manual procure')}
      >
        Procure
      </button>
    </div>
  );
};

describe('useSimulation Hook & Provider Context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn());
    // Silence warning console logs during mock executions
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize simulation states and generate RSA keys on bootstrap', async () => {
    const mockGetItem = vi.spyOn(localStorage, 'getItem').mockReturnValue(null);
    const mockSetItem = vi.spyOn(localStorage, 'setItem');

    render(
      <SimulationProvider>
        <TestConsumer />
      </SimulationProvider>
    );

    // Initial compute levels assertion
    expect(screen.getByTestId('compute-level').textContent).toBe('85');
    expect(screen.getByTestId('coolant-level').textContent).toBe('75');
    expect(screen.getByTestId('spend-limit').textContent).toBe('50000000');
    expect(screen.getByTestId('daily-spend').textContent).toBe('0');

    // Asserts RSA keys generated and set in localStorage
    expect(mockSetItem).toHaveBeenCalledWith('zt-agent-keys', expect.any(String));
  });

  it('should recover gracefully and initialize state when localStorage data is corrupted', () => {
    // Return corrupted JSON values
    vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === 'zt-agent-keys') return '{invalid_json';
      if (key === 'zt-inventory') return 'corrupted-data';
      return null;
    });

    render(
      <SimulationProvider>
        <TestConsumer />
      </SimulationProvider>
    );

    // Assert app does not crash and defaults are loaded
    expect(screen.getByTestId('compute-level').textContent).toBe('85');
    expect(screen.getByTestId('spend-limit').textContent).toBe('50000000');
  });

  it('should trigger AI procurement queue and adjust inventory on API settlement success', async () => {
    vi.spyOn(localStorage, 'getItem').mockReturnValue(null);
    
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        logs: ['[Ziti Router] Router payload sent'],
        responsePayload: {
          success: true,
          transactionId: 'tx_test_123',
          settledAmountUcents: 8000000,
          currency: 'USD',
          merchantId: 'aws_compute',
          authCode: '123456',
        }
      })
    });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <SimulationProvider>
        <TestConsumer />
      </SimulationProvider>
    );

    const procureBtn = screen.getByTestId('procure-btn');

    await act(async () => {
      procureBtn.click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Verify inventory refilled and spend updated
    // Note: compute level starts at 85. Refilling adds 50 (capped at 100).
    expect(screen.getByTestId('compute-level').textContent).toBe('100');
    expect(screen.getByTestId('daily-spend').textContent).toBe('8000000'); // 32 cores * 250,000 ucents = 8,000,000 ucents
  });

  it('should block procurement and record item as BLOCKED when Guard Mode limit is exceeded', async () => {
    // Mock settings with very low limit ($1.00 USD)
    const lowLimitSettings = {
      enabled: true,
      dailySpendLimitUcents: 1000000, // $1.00 USD
      allowlist: ['aws_compute'],
    };

    vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
      if (key === 'zt-guard-settings') return JSON.stringify(lowLimitSettings);
      return null;
    });

    render(
      <SimulationProvider>
        <TestConsumer />
      </SimulationProvider>
    );

    // Ensure low limit matches
    expect(screen.getByTestId('spend-limit').textContent).toBe('1000000');

    const procureBtn = screen.getByTestId('procure-btn');

    await act(async () => {
      procureBtn.click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Daily spend remains 0 because block was intercepted locally, and level stays 85
    expect(screen.getByTestId('compute-level').textContent).toBe('85');
    expect(screen.getByTestId('daily-spend').textContent).toBe('0');
  });
});
