import { AsyncResolveStrategy, IContainer } from "@spinajs/di";

export class FooService extends AsyncResolveStrategy {

    public Counter = 0;
    
    public resolveAsync(_: IContainer): Promise<void> {
        this.Counter ++;
        return Promise.resolve();
    }

}