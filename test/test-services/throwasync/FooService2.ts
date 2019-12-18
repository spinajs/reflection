import { AsyncResolveStrategy, IContainer } from "@spinajs/di";

export class FooService2 extends AsyncResolveStrategy {
    
    public resolveAsync(_: IContainer): Promise<void> {
        return Promise.resolve();
    }
    
}