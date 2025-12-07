/**
 * Cost Service
 *
 * Provides AWS cost tracking using Cost Explorer API.
 * Groups costs by service and compares with budget.
 *
 * Note: Cost Explorer API requires @aws-sdk/client-cost-explorer package.
 * If not available, returns mock data for development.
 */

// Try to import Cost Explorer client, fallback to mock if not available
let CostExplorerClient: any;
let GetCostAndUsageCommand: any;
let Granularity: any;

try {
  const costExplorerModule = require('@aws-sdk/client-cost-explorer');
  CostExplorerClient = costExplorerModule.CostExplorerClient;
  GetCostAndUsageCommand = costExplorerModule.GetCostAndUsageCommand;
  Granularity = costExplorerModule.Granularity;
} catch (error) {
  console.warn('Cost Explorer SDK not available, using mock data');
}

const costExplorerClient = CostExplorerClient
  ? new CostExplorerClient({ region: 'us-east-1' })
  : null;

export interface ServiceCost {
  service: string;
  amount: number;
  unit: string;
}

export interface CostPeriod {
  period: string;
  totalCost: number;
  services: ServiceCost[];
}

export interface CostData {
  today: CostPeriod;
  thisWeek: CostPeriod;
  thisMonth: CostPeriod;
  budget: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  timestamp: string;
}

export class CostService {
  /**
   * Get Cost Data
   *
   * Retrieves cost data for today, this week, and this month.
   *
   * @returns Cost data
   */
  async getCostData(): Promise<CostData> {
    const now = new Date();

    // Calculate date ranges
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch costs in parallel
    const [todayCost, weekCost, monthCost] = await Promise.all([
      this.getCostForPeriod(todayStart, now, 'Today'),
      this.getCostForPeriod(weekStart, now, 'This Week'),
      this.getCostForPeriod(monthStart, now, 'This Month'),
    ]);

    // Budget thresholds (based on requirements)
    const budget = {
      daily: 50, // $50/day alarm threshold
      weekly: 350, // $50/day * 7 days
      monthly: 1500, // ~$50/day * 30 days
    };

    return {
      today: todayCost,
      thisWeek: weekCost,
      thisMonth: monthCost,
      budget,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get Cost for Period
   *
   * Retrieves cost data for a specific time period.
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @param periodName - Period name for display
   * @returns Cost period data
   */
  private async getCostForPeriod(
    startDate: Date,
    endDate: Date,
    periodName: string
  ): Promise<CostPeriod> {
    // If Cost Explorer client not available, return mock data
    if (!costExplorerClient || !GetCostAndUsageCommand || !Granularity) {
      console.warn(`Cost Explorer not available, returning mock data for ${periodName}`);
      return this.getMockCostData(periodName);
    }

    try {
      const params: any = {
        TimePeriod: {
          Start: this.formatDate(startDate),
          End: this.formatDate(endDate),
        },
        Granularity: Granularity.DAILY,
        Metrics: ['UnblendedCost'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      };

      const result = await costExplorerClient.send(new GetCostAndUsageCommand(params));

      // Aggregate costs by service
      const serviceCosts = new Map<string, number>();
      let totalCost = 0;

      if (result.ResultsByTime) {
        for (const timeResult of result.ResultsByTime) {
          if (timeResult.Groups) {
            for (const group of timeResult.Groups) {
              const serviceName = group.Keys?.[0] || 'Unknown';
              const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');

              serviceCosts.set(serviceName, (serviceCosts.get(serviceName) || 0) + amount);
              totalCost += amount;
            }
          }
        }
      }

      // Convert to array and sort by cost (descending)
      const services: ServiceCost[] = Array.from(serviceCosts.entries())
        .map(([service, amount]) => ({
          service,
          amount: Math.round(amount * 100) / 100, // Round to 2 decimals
          unit: 'USD',
        }))
        .sort((a, b) => b.amount - a.amount);

      return {
        period: periodName,
        totalCost: Math.round(totalCost * 100) / 100,
        services,
      };
    } catch (error) {
      console.error(`Failed to get cost data for ${periodName}:`, error);

      // Return empty data on error
      return {
        period: periodName,
        totalCost: 0,
        services: [],
      };
    }
  }

  /**
   * Format Date
   *
   * Formats date for Cost Explorer API (YYYY-MM-DD).
   *
   * @param date - Date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get Mock Cost Data
   *
   * Returns mock cost data for development when Cost Explorer is not available.
   *
   * @param periodName - Period name
   * @returns Mock cost period data
   */
  private getMockCostData(periodName: string): CostPeriod {
    const mockServices: ServiceCost[] = [
      { service: 'Lambda', amount: 10.0, unit: 'USD' },
      { service: 'DynamoDB', amount: 8.5, unit: 'USD' },
      { service: 'S3', amount: 5.0, unit: 'USD' },
      { service: 'Bedrock', amount: 2.0, unit: 'USD' },
    ];

    const totalCost = mockServices.reduce((sum, s) => sum + s.amount, 0);

    return {
      period: periodName,
      totalCost: Math.round(totalCost * 100) / 100,
      services: mockServices,
    };
  }
}
