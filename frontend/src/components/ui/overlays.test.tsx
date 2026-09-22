import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { Select } from './Select';
import { Tabs } from './Tabs';
import { ToastProvider, useToast } from './Toast';

describe('Select', () => {
  it('exposes the trigger as a combobox with its accessible name', () => {
    render(
      <Select
        aria-label="Dataset"
        value={undefined}
        onValueChange={vi.fn()}
        options={[{ value: 'ds_1', label: 'household_power_consumption.txt' }]}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Dataset' })).toBeInTheDocument();
  });

  it('shows the placeholder until a value is chosen, then the label', () => {
    const options = [
      { value: 'daily', label: 'Daily aggregates' },
      { value: 'hourly', label: 'Hourly distribution' },
    ];

    const { rerender } = render(
      <Select
        aria-label="Template"
        value={undefined}
        onValueChange={vi.fn()}
        options={options}
        placeholder="Choose a template"
      />,
    );
    expect(screen.getByText('Choose a template')).toBeInTheDocument();

    rerender(
      <Select aria-label="Template" value="hourly" onValueChange={vi.fn()} options={options} />,
    );
    expect(screen.getByText('Hourly distribution')).toBeInTheDocument();
  });

  it('is not operable when disabled', () => {
    render(
      <Select
        aria-label="Dataset"
        value={undefined}
        onValueChange={vi.fn()}
        options={[]}
        disabled
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Dataset' })).toBeDisabled();
  });
});

describe('Tabs', () => {
  const items = [
    { value: 'daily', label: 'Daily', content: <p>daily panel</p> },
    { value: 'hourly', label: 'Hourly', content: <p>hourly panel</p> },
  ];

  it('names the tab list and shows the first panel by default', () => {
    render(<Tabs label="Consumption period" items={items} />);
    expect(screen.getByRole('tablist', { name: 'Consumption period' })).toBeInTheDocument();
    expect(screen.getByText('daily panel')).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<Tabs label="Consumption period" items={items} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Daily' }));
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Hourly' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('hourly panel')).toBeInTheDocument();
  });

  it('reports the selected tab through aria-selected', async () => {
    const onValueChange = vi.fn();
    render(<Tabs label="Consumption period" items={items} onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Hourly' }));
    expect(onValueChange).toHaveBeenCalledWith('hourly');
  });
});

describe('Dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Delete dataset
        </Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Delete dataset"
          description="This removes the dataset and its aggregates."
          footer={<Button variant="danger">Confirm</Button>}
        >
          <p>ds_fb313c180c6c</p>
        </Dialog>
      </>
    );
  }

  it('opens as a modal with an accessible name and description', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete dataset' }));

    const dialog = screen.getByRole('dialog', { name: 'Delete dataset' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('This removes the dataset and its aggregates.');
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete dataset' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers a labelled close control', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete dataset' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Toast', () => {
  function Harness() {
    const { toast } = useToast();
    return (
      <Button
        onClick={() => {
          toast({ title: 'Job submitted', description: 'ds_test · DAILY', status: 'ok' });
        }}
      >
        Submit
      </Button>
    );
  }

  it('shows a queued message with its status', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Job submitted')).toBeInTheDocument();
    expect(screen.getByText('ds_test · DAILY')).toBeInTheDocument();
  });

  it('dismisses on request', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Job submitted');

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Job submitted')).not.toBeInTheDocument();
  });

  it('throws if used outside the provider, rather than failing silently', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Harness />)).toThrow(/useToast must be used inside/);
    consoleError.mockRestore();
  });
});
