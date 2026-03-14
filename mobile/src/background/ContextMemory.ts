export interface AgentMemory {
  recentMessages: any[];
  pendingTasks: any[];
  userPreferences: any;
}

class ContextMemory {
  private memory: AgentMemory = {
    recentMessages: [],
    pendingTasks: [],
    userPreferences: {},
  };

  public getMemory() {
    return this.memory;
  }

  public updateMemory(partial: Partial<AgentMemory>) {
    this.memory = { ...this.memory, ...partial };
  }

  public addMessage(msg: any) {
    this.memory.recentMessages.push(msg);
    if (this.memory.recentMessages.length > 50) {
      this.memory.recentMessages.shift(); // keep last 50
    }
  }
}

export const AgentContext = new ContextMemory();
