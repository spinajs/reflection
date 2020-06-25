import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as ts from "typescript";

import { Configuration } from '@spinajs/configuration';
import { AsyncModule, DI } from '@spinajs/di';
import { IOFail, InvalidArgument } from '@spinajs/exceptions';
import { LogModule } from "@spinajs/log";

/**
 * Class info structure
 */
export class ClassInfo<T> {
    /**
     * Full file path of loaded class
     */
    public file: string;
    /**
     * Class name
     */
    public name: string;
    /**
     * Javascript class object
     */
    public type: any;

    /**
     * Resolved instance
     */
    public instance?: T;
}

/**
 * Helper class for extracting various information from typescript source code
 */
export class TypescriptCompiler {

    private tsFile: string;

    private compiled: ts.Program;

    constructor(filename: string) {

        this.tsFile = filename;

        this.compiled = ts.createProgram([this.tsFile], {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.Latest
        });
    }

    /**
     * 
     * Extracts all members info from typescript class eg. method name, parameters, return types etc.
     * 
     * @param className name of class to parse
     */
    public getClassMembers(className: string) {

        const members: Map<string, ts.MethodDeclaration> = new Map<string, ts.MethodDeclaration>();

        for (const sourceFile of this.compiled.getSourceFiles()) {
            if (sourceFile.isDeclarationFile) {
                // Walk the tree to search for classes

                ts.forEachChild(sourceFile, this.walkClassNode(className, this.walkMemberNode((method: ts.MethodDeclaration) => {
                    members.set((method.name as any).text, method);
                })));
            }
        }

        return members;
    }

    private walkClassNode(className: string, callback: (classNode: ts.ClassDeclaration) => void) {
        return (node: ts.Node) => {
            if (node.kind === ts.SyntaxKind.ClassDeclaration) {
                const cldecl = node as ts.ClassDeclaration;
                if (cldecl.name.text === className) {
                    callback(cldecl);
                }
            }
        }
    }

    private walkMemberNode(callback: (methodNode: ts.MethodDeclaration) => void) {
        return (node: ts.ClassDeclaration) => {
            for(const member of node.members)
            {
                if (member.kind === ts.SyntaxKind.MethodDeclaration) {
                    const method = member as ts.MethodDeclaration;
                    callback(method);
                }
            }
           
        }
    }
}


/**
 * Returns resolved instances of classes from specified files.
 * It automatically checks if should resolve promise or not, calls resolve strategy, checks if should return new or signleton etc, resolves 
 * dependencies etc.
 *
 * @param filter - files to look at, uses glob pattern to search
 * @param configPath - dir paths taken from app config eg. "system.dirs.controllers". Path MUST be avaible in configuration
 * 
 */
export function ResolveFromFiles(filter: string, configPath: string) {
    return _listOrResolveFromFiles(filter, configPath, true);
}


/**
 * Returns list of class types found in specified path. It do not resolve / create instances
 * 
 * @param filter - files to look at, uses glob pattern to search
 * @param configPath - dir paths taken from app config eg. "system.dirs.controllers". Path MUST be avaible in configuration
 * 
 */
export function ListFromFiles(filter: string, configPath: string) {
    return _listOrResolveFromFiles(filter, configPath, false);
}


function _listOrResolveFromFiles(filter: string, configPath: string, resolve: boolean) {
    return (target: any, propertyKey: string | symbol) => {

        if (!filter) {
            throw new InvalidArgument("filter parameter is null or empty");
        }

        if (!configPath) {
            throw new InvalidArgument("configPath parameter is null or empty");
        }

        let instances: Array<ClassInfo<any>> | Promise<Array<ClassInfo<any>>> = null;

        const getter = () => {
            if (!instances) {
                instances = _loadInstances();
            }

            return instances;
        };

        Object.defineProperty(target, propertyKey, {
            enumerable: true,
            get: getter,
        });

        function _loadInstances(): Promise<Array<ClassInfo<any>>> | Array<ClassInfo<any>> {

            const config = DI.resolve(Configuration);
            const logger = DI.resolve(LogModule).getLogger();
            const directories = config.get<string[]>(configPath);

            if (!directories || directories.length === 0) {
                return [];
            }

            let promised = false;
            const result = directories.map((d: string) => path.normalize(d))
                .filter((d: string) => {
                    const exists = fs.existsSync(d);
                    if (!exists) {
                        logger.warn(`Directory ${d} not exists`);
                    }
                    
                    return exists;
                })
                .flatMap((d: string) => glob.sync(path.join(d, filter)))
                .map((f: string) => {

                    logger.trace(`Loading file ${f}`);

                    const name = path.parse(f).name;
                    const type = require(f)[name];

                    if (!type) {
                        throw new IOFail(`cannot find class ${name} in file ${f}`);
                    }

                    if (resolve) {
                        if (type.prototype instanceof AsyncModule) {
                            promised = true;
                            return (DI.resolve(type) as any).then((instance: any) => {
                                return {
                                    file: f,
                                    instance,
                                    name,
                                    type,
                                };
                            });
                        }
                    }


                    return {
                        file: f,
                        instance: resolve ? DI.resolve(type) : null,
                        name,
                        type,
                    };
                });

            return (promised && resolve) ? Promise.all(result) : result;
        }
    }
}

