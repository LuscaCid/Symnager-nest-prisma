import { NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

interface MiddlewareRequest extends Request {
  body : {phrase : string}
}

export class EnsureAuthenticated implements NestMiddleware {
  use(req: MiddlewareRequest, res: Response, next: NextFunction) {
    //const AuthHeader = req.headers.authorization;
    const {phrase} = req.body
    if(!phrase)return res.status(401).json({message : "frase nao passada"})
    if(phrase.includes("123"))return next()
    return res.status(401).json({message : "123 nao passado na requisicao"})
    //if(!AuthHeader)return console.log("Token jwt nao enviado")
  }
}