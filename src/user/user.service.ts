import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { DeleteResult, getRepository, Repository } from "typeorm"
import { validate } from "class-validator"
import * as argon2 from "argon2"
import * as jwt from "jsonwebtoken"
import { UserEntity } from "./user.entity"
import { UserRO } from "./user.interface"
import { UserCreateDTO, UserUpdateDTO } from "./dto"
import { SECRET } from "../config"

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findAll(): Promise<UserEntity[]> {
    return await this.userRepository.find()
  }

  async findOne(email: string, password: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ email })
    if (!user) {
      return null
    }
    if (await argon2.verify(user.password, password)) {
      return user
    }
    return null
  }

  async create(dto: UserCreateDTO): Promise<UserRO> {
    // Check uniqueness of username/email
    const { username, email, password } = dto
    const qb = await getRepository(UserEntity)
      .createQueryBuilder("user")
      .where("user.username = :username", { username })
      .orWhere("user.email = :email", { email })
    const user = await qb.getOne()

    if (user) {
      const errors = { username: "Username and email must be unique" }
      throw new HttpException(
        { message: "Input invalid", errors },
        HttpStatus.BAD_REQUEST,
      )
    }

    // Create new user
    const newUser = new UserEntity()
    newUser.email = email
    newUser.username = username
    newUser.password = password
    newUser.articles = []

    const errors = await validate(newUser)
    if (errors.length > 0) {
      const _errors = { username: "Username input is not valid" }
      throw new HttpException(
        { message: "Input invalid", _errors },
        HttpStatus.BAD_REQUEST,
      )
    } else {
      const saveUser = await this.userRepository.save(newUser)
      return this.buildUserRO(saveUser)
    }
  }

  async update(id: number, dto: UserUpdateDTO): Promise<UserEntity> {
    const toUpdate = await this.userRepository.findOne(id)
    delete toUpdate.password
    delete toUpdate.favorites

    const updated = Object.assign(toUpdate, dto)
    return await this.userRepository.save(updated)
  }

  async delete(email: string): Promise<DeleteResult> {
    return await this.userRepository.delete({ email: email })
  }

  async findById(id: number): Promise<UserRO> {
    const user = await this.userRepository.findOne(id)
    if (!user) {
      const errors = { user: "Not Found" }
      throw new HttpException({ errors }, 401)
    }
    return this.buildUserRO(user)
  }

  async findByEmail(email: string): Promise<UserRO> {
    const user = await this.userRepository.findOne({ email: email })
    return this.buildUserRO(user)
  }

  public generateJWT(user) {
    const today = new Date()
    const exp = new Date(today)
    exp.setDate(today.getDate() + 60)
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      exp: exp.getTime() / 1000,
    }
    return jwt.sign(payload, SECRET)
  }

  private buildUserRO(user: UserEntity) {
    const userRO = {
      id: user.id,
      username: user.username,
      email: user.email,
      bio: user.email,
      token: this.generateJWT(user),
      image: user.image,
    }
    return { user: userRO }
  }
}