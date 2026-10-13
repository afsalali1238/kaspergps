// Severity and type styling for alert rows (Agent G). Tokens only.

import {
  Activity, BatteryLow, CircleAlert, Fuel, Gauge, Hexagon, Info, Moon, OctagonAlert,
  PlugZap, Receipt, Timer, TriangleAlert, Truck, WifiOff, Wrench, type LucideIcon,
} from 'lucide-react';
import type { AlertType } from '@/domain/types';
import type { AlertSeverity } from '@/server/api';
import type { Tone } from '@/components/ui';

export const SEVERITY_TONE: Record<AlertSeverity, Tone> = {
  critical: 'bad',
  warning: 'warn',
  info: 'info',
};

/** The left border on a row (full literal classes so Tailwind keeps them). */
export const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  critical: 'border-l-bad',
  warning: 'border-l-warn',
  info: 'border-l-info',
};

export const SEVERITY_ICON: Record<AlertSeverity, LucideIcon> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

export const TYPE_ICON: Record<AlertType, LucideIcon> = {
  offline: WifiOff,
  power_cut: PlugZap,
  fuel_drop: Fuel,
  low_fuel: Fuel,
  fault_code: CircleAlert,
  towing: Truck,
  overspeed: Gauge,
  harsh_driving: Activity,
  low_battery: BatteryLow,
  after_hours_move: Moon,
  geofence_enter: Hexagon,
  geofence_exit: Hexagon,
  maintenance_due: Wrench,
  maintenance_overdue: Wrench,
  invoice_overdue: Receipt,
  idle: Timer,
};
