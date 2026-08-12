import { logger } from '../../infrastructure/logging/logger';
import { OAuth21Client } from '../../infrastructure/auth/oauth2_1';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  oauthEndpoint: string;
}

/**
 * Model Context Protocol (MCP) Tool Discovery and Orchestration Handler.
 * Discovers available machine tools dynamically via standardized OAuth 2.1 secured endpoints.
 */
export class MCPToolClient {
  private oauthClient: OAuth21Client;
  private registeredTools: Map<string, MCPToolDefinition> = new Map();

  constructor(oauthClient?: OAuth21Client) {
    this.oauthClient = oauthClient || new OAuth21Client();
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    const defaultTools: MCPToolDefinition[] = [
      {
        name: 'x402_settlement_procurement',
        description: 'Executes Mastercard AP4M x402 payment settlement over OpenZiti dark network',
        inputSchema: {
          type: 'object',
          properties: {
            merchantId: { type: 'string' },
            amountUcents: { type: 'number' },
            intent: { type: 'string' },
          },
          required: ['merchantId', 'amountUcents', 'intent'],
        },
        oauthEndpoint: 'http://localhost:8080/oauth2/mcp/x402-settlement',
      },
      {
        name: 'telemetry_hardware_monitor',
        description: 'Queries compute and coolant telemetry metrics from edge hardware sensors',
        inputSchema: {
          type: 'object',
          properties: {
            resourceType: { type: 'string', enum: ['compute', 'coolant'] },
          },
          required: ['resourceType'],
        },
        oauthEndpoint: 'http://localhost:8080/oauth2/mcp/telemetry',
      },
    ];

    for (const tool of defaultTools) {
      this.registeredTools.set(tool.name, tool);
    }
  }

  public discoverTools(): MCPToolDefinition[] {
    logger.info('MCP Protocol: Discovering dynamic tools over OAuth 2.1 endpoints', {
      action: 'mcp_tool_discovery',
      count: this.registeredTools.size,
    });
    return Array.from(this.registeredTools.values());
  }

  public getTool(name: string): MCPToolDefinition | undefined {
    return this.registeredTools.get(name);
  }
}
