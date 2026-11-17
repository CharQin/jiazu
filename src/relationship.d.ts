declare module "relationship.js" {
  export default function relationship(options: {
    text: string;
    sex?: number;
    type?: string;
    reverse?: boolean;
    mode?: string;
    optimal?: boolean;
  }): string[];
}
