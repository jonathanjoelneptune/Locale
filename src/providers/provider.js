export class EventProvider{
  constructor({id,name,kind="data"}){
    if(!id||!name)throw new Error("EventProvider requires id and name");
    this.id=id;
    this.name=name;
    this.kind=kind;
  }

  async getEvents(){
    throw new Error(`${this.id} must implement getEvents()`);
  }
}

export function validateProviderEvents(provider,events){
  if(!Array.isArray(events))throw new Error(`${provider.id} returned a non-array event payload`);
  return events;
}
